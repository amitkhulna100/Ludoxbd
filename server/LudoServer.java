package server;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/**
 * Ludo X BD - Zero-Dependency Java WebSocket Multiplayer Server
 * Supports: Board Selection (Dhaka, Chattogram, Sylhet, Cox's Bazar, Padma),
 * 60-Second Countdown Waiting Lobbies, Synchronized Turns, Moves, and Emotes.
 */
public class LudoServer {
    private static final int PORT = 3000;
    private static final Map<String, ClientSession> clients = new ConcurrentHashMap<>();
    private static final Map<String, WaitingLobby> lobbies = new ConcurrentHashMap<>();
    private static final Map<String, GameRoom> activeRooms = new ConcurrentHashMap<>();
    private static final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(4);

    public static void main(String[] args) {
        System.out.println("=================================================");
        System.out.println("  Ludo X BD Java Multiplayer Server Starting...");
        System.out.println("  Port: " + PORT);
        System.out.println("  Waiting Room Countdown: 60 Seconds");
        System.out.println("=================================================");

        try (ServerSocket serverSocket = new ServerSocket(PORT)) {
            System.out.println(">> Server is ONLINE on port " + PORT);
            while (true) {
                Socket socket = serverSocket.accept();
                CompletableFuture.runAsync(() -> handleConnection(socket));
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private static void handleConnection(Socket socket) {
        ClientSession client = null;
        try {
            InputStream in = socket.getInputStream();
            OutputStream out = socket.getOutputStream();

            // Read raw bytes until \r\n\r\n without buffering ahead
            ByteArrayOutputStream headerBuf = new ByteArrayOutputStream();
            int prev = 0, curr = 0;
            int crlfCount = 0;
            while ((curr = in.read()) != -1) {
                headerBuf.write(curr);
                if (curr == '\n' && prev == '\r') {
                    crlfCount++;
                    if (crlfCount == 2) break; // \r\n\r\n boundary reached
                } else if (curr != '\r') {
                    crlfCount = 0;
                }
                prev = curr;
            }

            if (headerBuf.size() == 0) {
                socket.close();
                return;
            }

            String headerText = headerBuf.toString(StandardCharsets.UTF_8);
            String[] lines = headerText.split("\r\n");
            String requestLine = lines[0];

            Map<String, String> headers = new HashMap<>();
            for (int i = 1; i < lines.length; i++) {
                int colon = lines[i].indexOf(':');
                if (colon > 0) {
                    headers.put(lines[i].substring(0, colon).trim().toLowerCase(), lines[i].substring(colon + 1).trim());
                }
            }

            // 1. Check if WebSocket Upgrade request FIRST!
            String wsKey = headers.get("sec-websocket-key");
            if (wsKey != null) {
                String acceptKey = Base64.getEncoder().encodeToString(
                        MessageDigest.getInstance("SHA-1").digest((wsKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.UTF_8))
                );

                String handshake = "HTTP/1.1 101 Switching Protocols\r\n" +
                        "Upgrade: websocket\r\n" +
                        "Connection: Upgrade\r\n" +
                        "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n";
                out.write(handshake.getBytes(StandardCharsets.UTF_8));
                out.flush();

                String clientId = "c_" + UUID.randomUUID().toString().substring(0, 8);
                client = new ClientSession(clientId, socket, out);
                clients.put(clientId, client);
                System.out.println("[WebSocket Connected]: " + clientId + " (Total: " + clients.size() + ")");

                client.send("CONNECTED", "{\"clientId\":\"" + clientId + "\"}");
                sendBoardList(client);

                // Frame reader
                DataInputStream dataIn = new DataInputStream(in);
                while (!socket.isClosed()) {
                    int b1 = dataIn.read();
                    if (b1 == -1) break;
                    int b2 = dataIn.read();
                    if (b2 == -1) break;

                    boolean isMasked = (b2 & 0x80) != 0;
                    long len = b2 & 0x7F;
                    if (len == 126) len = dataIn.readUnsignedShort();
                    else if (len == 127) len = dataIn.readLong();

                    byte[] mask = new byte[4];
                    if (isMasked) dataIn.readFully(mask);

                    byte[] payload = new byte[(int) len];
                    dataIn.readFully(payload);

                    if (isMasked) {
                        for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
                    }

                    String text = new String(payload, StandardCharsets.UTF_8);
                    processClientMessage(client, text);
                }
                return;
            }

            // 2. Regular HTTP Health Check / Status endpoint
            if (requestLine.startsWith("GET /health") || requestLine.startsWith("GET / ")) {
                String json = "{\"status\":\"online\",\"engine\":\"Java LudoServer\",\"port\":" + PORT + ",\"lobbies\":" + lobbies.size() + ",\"rooms\":" + activeRooms.size() + ",\"clients\":" + clients.size() + "}";
                byte[] body = json.getBytes(StandardCharsets.UTF_8);
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: " + body.length + "\r\n\r\n").getBytes());
                out.write(body);
                out.flush();
                socket.close();
                return;
            }

            socket.close();

        } catch (Exception ignored) {
        } finally {
            if (client != null) {
                handleLeaveLobby(client);
                clients.remove(client.id);
            }
            try { socket.close(); } catch (Exception ignored) {}
        }
    }

    private static void processClientMessage(ClientSession client, String text) {
        try {
            String type = extractField(text, "type");
            if (type.equals("SET_PROFILE")) {
                client.name = extractNested(text, "payload", "name", client.name);
            } else if (type.equals("GET_BOARDS")) {
                sendBoardList(client);
            } else if (type.equals("JOIN_BOARD")) {
                String boardId = extractNested(text, "payload", "boardId", "dhaka");
                handleJoinBoard(client, boardId);
            } else if (type.equals("LEAVE_LOBBY")) {
                handleLeaveLobby(client);
            } else if (type.equals("FORCE_START_LOBBY")) {
                handleForceStartLobby(client);
            } else if (type.equals("ROLL_DICE")) {
                String targetColor = extractNested(text, "payload", "color", client.color);
                handleRollDice(client, targetColor);
            } else if (type.equals("MOVE_TOKEN")) {
                String tokenId = extractNested(text, "payload", "tokenId", "");
                String targetColor = extractNested(text, "payload", "color", client.color);
                handleMoveToken(client, targetColor, tokenId);
            } else if (type.equals("PASS_TURN")) {
                if (client.room != null) {
                    client.room.nextTurn();
                }
            } else if (type.equals("SEND_EMOTE")) {
                String emoji = extractNested(text, "payload", "emoji", "🎲");
                if (client.room != null) {
                    client.room.broadcast("EMOTE_RECEIVED", "{\"color\":\"" + client.color + "\",\"emoji\":\"" + emoji + "\"}");
                }
            } else if (type.equals("PING")) {
                client.send("PONG", "{\"time\":" + System.currentTimeMillis() + "}");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static void sendBoardList(ClientSession client) {
        String[] ids = {"dhaka", "chittagong", "sylhet", "cox", "padma"};
        String[] names = {"ঢাকা এরিনা (Dhaka Arena)", "চট্টগ্রাম রয়্যালস (Chattogram)", "সিলেট সুপার কিংস (Sylhet)", "কক্সবাজার গোল্ডেন বিচ (Cox's Bazar)", "পদ্মা এক্সপ্রেস (Padma Express)"};
        int[] fees = {500, 1000, 2500, 5000, 10000};
        int[] prizes = {1800, 3600, 9000, 18000, 36000};
        String[] icons = {"🏛️", "👑", "⚡", "🏖️", "🚄"};

        StringBuilder sb = new StringBuilder("{\"boards\":[");
        for (int i = 0; i < ids.length; i++) {
            WaitingLobby lob = lobbies.get(ids[i]);
            int count = (lob != null) ? lob.players.size() : 0;
            int rem = (lob != null) ? lob.remainingSeconds : 60;
            sb.append("{\"id\":\"").append(ids[i])
              .append("\",\"name\":\"").append(names[i])
              .append("\",\"fee\":").append(fees[i])
              .append(",\"winPrize\":").append(prizes[i])
              .append(",\"icon\":\"").append(icons[i])
              .append("\",\"waitingCount\":").append(count)
              .append(",\"remainingSeconds\":").append(rem)
              .append("}").append(i < ids.length - 1 ? "," : "");
        }
        sb.append("]}");
        client.send("BOARD_LIST", sb.toString());
    }

    private static synchronized void handleJoinBoard(ClientSession client, String boardId) {
        handleLeaveLobby(client);

        WaitingLobby lobby = lobbies.computeIfAbsent(boardId, id -> new WaitingLobby(id));
        if (lobby.players.size() >= 4) {
            client.send("NOTICE", "{\"message\":\"এই বোর্ডটি পূর্ণ হয়ে গেছে!\"}");
            return;
        }

        String[] colors = {"red", "green", "yellow", "blue"};
        client.color = colors[lobby.players.size()];
        client.lobby = lobby;
        lobby.players.add(client);

        System.out.println("[Lobby Join] Player " + client.name + " (" + client.color + ") joined " + boardId + " (" + lobby.players.size() + "/4)");

        client.send("LOBBY_JOINED", "{\"boardId\":\"" + boardId + "\",\"myColor\":\"" + client.color + "\",\"remainingSeconds\":" + lobby.remainingSeconds + ",\"players\":" + lobby.getPlayersJson() + "}");
        lobby.broadcast("PLAYER_JOINED_LOBBY", "{\"joinedPlayer\":{\"name\":\"" + client.name + "\",\"color\":\"" + client.color + "\"},\"players\":" + lobby.getPlayersJson() + ",\"remainingSeconds\":" + lobby.remainingSeconds + "}");

        if (lobby.players.size() == 4) {
            lobby.startMatch();
        }
    }

    private static synchronized void handleLeaveLobby(ClientSession client) {
        if (client.lobby != null) {
            WaitingLobby lobby = client.lobby;
            lobby.players.remove(client);
            client.lobby = null;

            if (lobby.players.isEmpty()) {
                lobby.cancel();
                lobbies.remove(lobby.boardId);
            } else {
                lobby.broadcast("PLAYER_LEFT_LOBBY", "{\"leftColor\":\"" + client.color + "\",\"players\":" + lobby.getPlayersJson() + ",\"remainingSeconds\":" + lobby.remainingSeconds + "}");
            }
        }
    }

    private static synchronized void handleForceStartLobby(ClientSession client) {
        if (client.lobby != null && client.lobby.players.size() >= 1) {
            client.lobby.startMatch();
        }
    }

    private static void handleRollDice(ClientSession client, String targetColor) {
        GameRoom room = client.room;
        if (room == null) return;
        int roll = (Math.random() < 0.22) ? 6 : (1 + new Random().nextInt(5));
        room.lastDice = roll;
        String rollColor = (targetColor != null && !targetColor.isEmpty()) ? targetColor : client.color;
        room.broadcast("DICE_ROLLED", "{\"color\":\"" + rollColor + "\",\"roll\":" + roll + ",\"isSix\":" + (roll == 6) + "}");
    }

    private static void handleMoveToken(ClientSession client, String targetColor, String tokenId) {
        GameRoom room = client.room;
        if (room == null) return;
        String moveColor = (targetColor != null && !targetColor.isEmpty()) ? targetColor : client.color;
        room.broadcast("TOKEN_MOVED", "{\"color\":\"" + moveColor + "\",\"tokenId\":\"" + tokenId + "\",\"diceValue\":" + room.lastDice + "}");
        room.nextTurn();
    }

    static class PlayerInfo {
        String id;
        String name;
        String color;
        boolean isBot;
        ClientSession session;

        PlayerInfo(String id, String name, String color, boolean isBot, ClientSession session) {
            this.id = id;
            this.name = name;
            this.color = color;
            this.isBot = isBot;
            this.session = session;
        }
    }

    static class WaitingLobby {
        String boardId;
        List<ClientSession> players = new CopyOnWriteArrayList<>();
        int remainingSeconds = 60;
        ScheduledFuture<?> timerTask;

        WaitingLobby(String boardId) {
            this.boardId = boardId;
            this.timerTask = scheduler.scheduleAtFixedRate(() -> {
                remainingSeconds--;
                broadcast("LOBBY_TICK", "{\"boardId\":\"" + boardId + "\",\"remainingSeconds\":" + remainingSeconds + ",\"players\":" + getPlayersJson() + "}");
                if (remainingSeconds <= 0) {
                    startMatch();
                }
            }, 1, 1, TimeUnit.SECONDS);
        }

        void cancel() {
            if (timerTask != null) timerTask.cancel(true);
        }

        void broadcast(String type, String json) {
            for (ClientSession p : players) p.send(type, json);
        }

        String getPlayersJson() {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < players.size(); i++) {
                ClientSession p = players.get(i);
                sb.append("{\"id\":\"").append(p.id)
                  .append("\",\"name\":\"").append(p.name)
                  .append("\",\"color\":\"").append(p.color)
                  .append("\"}").append(i < players.size() - 1 ? "," : "");
            }
            sb.append("]");
            return sb.toString();
        }

        boolean started = false;

        synchronized void startMatch() {
            if (started) return;
            started = true;
            cancel();
            lobbies.remove(boardId);
            String roomCode = String.valueOf(100000 + new Random().nextInt(900000));

            // Auto-Backfill with smart Bots up to 4 players so the match NEVER hangs!
            String[] allColors = {"red", "green", "yellow", "blue"};
            String[] botNames = {"সাকিব_কিং 🇧🇩 🤖", "তামিম_প্রো 🇧🇩 🤖", "রাহুল_লুডু 🇧🇩 🤖"};
            int botIdx = 0;

            List<PlayerInfo> allPlayers = new ArrayList<>();
            for (ClientSession p : players) {
                allPlayers.add(new PlayerInfo(p.id, p.name, p.color, false, p));
            }

            // Fill remaining empty slots with bots up to 4
            for (int i = allPlayers.size(); i < 4; i++) {
                String botColor = allColors[i];
                String bName = (botIdx < botNames.length) ? botNames[botIdx++] : ("রোবট " + (i + 1) + " 🤖");
                allPlayers.add(new PlayerInfo("bot_" + botColor, bName, botColor, true, null));
            }

            GameRoom room = new GameRoom(roomCode, boardId, allPlayers);
            activeRooms.put(roomCode, room);

            for (PlayerInfo pi : allPlayers) {
                if (pi.session != null) {
                    pi.session.lobby = null;
                    pi.session.room = room;
                }
            }

            String hostId = players.isEmpty() ? "none" : players.get(0).id;
            System.out.println("[Match Started] Room #" + roomCode + " on " + boardId + " with " + players.size() + " humans and " + (4 - players.size()) + " bots.");
            room.broadcast("MATCH_STARTED", "{\"roomCode\":\"" + roomCode + "\",\"boardId\":\"" + boardId + "\",\"hostId\":\"" + hostId + "\",\"players\":" + room.getPlayersJson() + ",\"startingTurn\":\"red\"}");
        }
    }

    static class GameRoom {
        String code;
        String boardId;
        List<PlayerInfo> allPlayers;
        int turnIndex = 0;
        int lastDice = 1;

        GameRoom(String code, String boardId, List<PlayerInfo> allPlayers) {
            this.code = code;
            this.boardId = boardId;
            this.allPlayers = allPlayers;
        }

        void nextTurn() {
            if (lastDice != 6) {
                turnIndex = (turnIndex + 1) % allPlayers.size();
            }
            broadcast("TURN_CHANGED", "{\"nextTurn\":\"" + allPlayers.get(turnIndex).color + "\"}");
        }

        void broadcast(String type, String json) {
            for (PlayerInfo p : allPlayers) {
                if (p.session != null) {
                    p.session.send(type, json);
                }
            }
        }

        String getPlayersJson() {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < allPlayers.size(); i++) {
                PlayerInfo p = allPlayers.get(i);
                sb.append("{\"id\":\"").append(p.id)
                  .append("\",\"name\":\"").append(p.name)
                  .append("\",\"color\":\"").append(p.color)
                  .append("\",\"isBot\":").append(p.isBot)
                  .append("}").append(i < allPlayers.size() - 1 ? "," : "");
            }
            sb.append("]");
            return sb.toString();
        }
    }

    static class ClientSession {
        String id;
        Socket socket;
        OutputStream out;
        String name = "খেলোয়াড়";
        String color = "red";
        WaitingLobby lobby;
        GameRoom room;

        ClientSession(String id, Socket socket, OutputStream out) {
            this.id = id;
            this.socket = socket;
            this.out = out;
        }

        synchronized void send(String type, String payloadJson) {
            try {
                if (socket.isClosed()) return;
                String msg = "{\"type\":\"" + type + "\",\"payload\":" + payloadJson + "}";
                byte[] raw = msg.getBytes(StandardCharsets.UTF_8);

                ByteArrayOutputStream frame = new ByteArrayOutputStream();
                frame.write(0x81);
                if (raw.length < 126) frame.write(raw.length);
                else if (raw.length <= 65535) {
                    frame.write(126);
                    frame.write((raw.length >> 8) & 0xFF);
                    frame.write(raw.length & 0xFF);
                } else {
                    frame.write(127);
                    for (int i = 7; i >= 0; i--) frame.write((int) ((raw.length >> (8 * i)) & 0xFF));
                }
                frame.write(raw);
                out.write(frame.toByteArray());
                out.flush();
            } catch (Exception ignored) {}
        }
    }

    private static String extractField(String json, String key) {
        int idx = json.indexOf("\"" + key + "\"");
        if (idx == -1) return "";
        int colon = json.indexOf(':', idx + key.length() + 2);
        if (colon == -1) return "";
        String after = json.substring(colon + 1).trim();
        if (after.startsWith("\"")) {
            int end = after.indexOf('"', 1);
            if (end != -1) return after.substring(1, end);
        } else {
            int end = 0;
            while (end < after.length() && after.charAt(end) != ',' && after.charAt(end) != '}' && after.charAt(end) != ']') {
                end++;
            }
            return after.substring(0, end).trim();
        }
        return "";
    }

    private static String extractNested(String json, String parent, String key, String def) {
        int pIdx = json.indexOf("\"" + parent + "\"");
        if (pIdx == -1) return def;
        String sub = json.substring(pIdx);
        String val = extractField(sub, key);
        return val.isEmpty() ? def : val;
    }
}
