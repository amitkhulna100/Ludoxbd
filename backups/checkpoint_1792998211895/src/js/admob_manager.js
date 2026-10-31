/**
 * Ludo X BD - Official Google AdMob Integration Manager
 * Handles Banner, Rewarded Video, and Interstitial Ads with native AndroidBridge
 * and seamless in-app fallback.
 */
class AdMobManager {
    constructor() {
        this.config = {
            appId: 'ca-app-pub-3940256099942544~3347511713',        // Official Google AdMob Test App ID
            bannerId: 'ca-app-pub-3940256099942544/6300978111',     // Test Banner ID
            rewardedId: 'ca-app-pub-3940256099942544/5224354917',   // Test Rewarded Video ID
            interstitialId: 'ca-app-pub-3940256099942544/1033173712'// Test Interstitial ID
        };

        this.isNativeAvailable = typeof window.AndroidBridge !== 'undefined' && 
                                 typeof window.AndroidBridge.showRewardedAd === 'function';
        this.bannerVisible = false;
        this.rewardCallbacks = new Map();
        this.init();
    }

    init() {
        console.log('[AdMobManager] Initialized with App ID:', this.config.appId);
        
        // Listen for native AdMob callbacks from AndroidBridge
        window.onNativeAdReward = (rewardAmount, rewardType) => {
            console.log('[AdMobManager] Native Rewarded Ad completed:', rewardAmount, rewardType);
            this.handleRewardGranted(rewardAmount || 1000, rewardType || 'coins');
        };

        window.onNativeAdClosed = () => {
            console.log('[AdMobManager] Native Ad closed.');
        };

        this.injectBannerContainer();
        this.showBannerAd();
    }

    injectBannerContainer() {
        if (document.getElementById('admobBannerContainer')) return;
        const banner = document.createElement('div');
        banner.id = 'admobBannerContainer';
        banner.className = 'admob-banner-wrap';
        banner.innerHTML = `
            <div class="admob-banner-content">
                <span class="admob-badge">Ad</span>
                <span class="admob-title">Ludo X BD Special Offer • Google AdMob</span>
                <button class="admob-close-btn" id="btnAdmobCloseBanner" title="Hide Ad">✕</button>
            </div>
        `;
        document.body.appendChild(banner);

        const closeBtn = document.getElementById('btnAdmobCloseBanner');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideBannerAd();
            });
        }
    }

    showBannerAd() {
        this.bannerVisible = true;
        if (this.isNativeAvailable && window.AndroidBridge.showBannerAd) {
            try {
                window.AndroidBridge.showBannerAd();
                return;
            } catch (e) {
                console.warn('[AdMobManager] Native banner call failed, using web banner fallback', e);
            }
        }
        const banner = document.getElementById('admobBannerContainer');
        if (banner) {
            banner.classList.add('visible');
        }
    }

    hideBannerAd() {
        this.bannerVisible = false;
        if (this.isNativeAvailable && window.AndroidBridge.hideBannerAd) {
            try {
                window.AndroidBridge.hideBannerAd();
            } catch (e) {}
        }
        const banner = document.getElementById('admobBannerContainer');
        if (banner) {
            banner.classList.remove('visible');
        }
    }

    showRewardedAd(onSuccess = null, onFailed = null) {
        if (onSuccess) {
            this.currentOnSuccess = onSuccess;
        }

        // Check if Android Native AdMob is present
        if (this.isNativeAvailable && window.AndroidBridge.showRewardedAd) {
            try {
                const called = window.AndroidBridge.showRewardedAd();
                if (called) return;
            } catch (e) {
                console.warn('[AdMobManager] Native showRewardedAd error, falling back to simulator', e);
            }
        }

        // In-App Interactive Rewarded Video Fallback
        this.launchRewardedSimulator(onSuccess, onFailed);
    }

    launchRewardedSimulator(onSuccess, onFailed) {
        const modal = document.getElementById('modalVideoAd');
        const countdownText = document.getElementById('adCountdownText');
        const progressBar = document.getElementById('adProgressBar');
        const statusText = document.getElementById('adStatusText');
        const btnClaim = document.getElementById('btnClaimAdReward');
        const btnClose = document.getElementById('btnCloseVideoAd');

        if (!modal) {
            if (onSuccess) onSuccess(1000, 'coins');
            return;
        }

        modal.classList.add('active');
        if (btnClaim) btnClaim.style.display = 'none';
        if (btnClose) btnClose.style.display = 'none';
        if (progressBar) progressBar.style.width = '0%';
        if (statusText) statusText.textContent = 'বিজ্ঞাপন চলছে, কয়েন পাওয়ার জন্য সম্পূর্ণ দেখুন...';

        let timeLeft = 5;
        if (countdownText) countdownText.textContent = timeLeft;

        const timer = setInterval(() => {
            timeLeft--;
            if (countdownText) countdownText.textContent = Math.max(0, timeLeft);
            if (progressBar) progressBar.style.width = `${((5 - timeLeft) / 5) * 100}%`;

            if (timeLeft <= 0) {
                clearInterval(timer);
                if (countdownText) countdownText.textContent = '✔';
                if (statusText) statusText.textContent = '🎉 অভিনন্দন! বিজ্ঞাপন দেখা সম্পন্ন হয়েছে।';
                if (btnClaim) {
                    btnClaim.style.display = 'block';
                    btnClaim.onclick = () => {
                        modal.classList.remove('active');
                        this.handleRewardGranted(1000, 'coins');
                        if (onSuccess) onSuccess(1000, 'coins');
                    };
                }
                if (btnClose) {
                    btnClose.style.display = 'block';
                    btnClose.onclick = () => {
                        modal.classList.remove('active');
                    };
                }
            }
        }, 1000);
    }

    showInterstitialAd(onClose = null) {
        if (this.isNativeAvailable && window.AndroidBridge.showInterstitialAd) {
            try {
                window.AndroidBridge.showInterstitialAd();
                if (onClose) setTimeout(onClose, 800);
                return;
            } catch (e) {}
        }

        // Lightweight Interstitial Modal
        let interModal = document.getElementById('modalAdmobInterstitial');
        if (!interModal) {
            interModal = document.createElement('div');
            interModal.id = 'modalAdmobInterstitial';
            interModal.className = 'modal-overlay';
            interModal.innerHTML = `
                <div class="modal-card gold-border admob-inter-card">
                    <div class="admob-inter-header">
                        <span class="admob-badge">Google AdMob</span>
                        <button class="modal-close-icon" id="btnCloseAdmobInter">✕</button>
                    </div>
                    <div class="admob-inter-body">
                        <h3>🎲 Ludo X BD - Play & Win!</h3>
                        <p>প্রতিদিন খেলুন এবং জিতে নিন আকর্ষণীয় গোল্ডেন ডাইস স্কিন!</p>
                        <div class="admob-inter-ad-box">
                            <span class="ad-pulse-text">বিজ্ঞাপন বিরতি</span>
                        </div>
                    </div>
                    <button class="btn-primary" id="btnContinueFromAdmobInter" style="margin-top:14px;">চালিয়ে যান (Continue)</button>
                </div>
            `;
            document.body.appendChild(interModal);
        }

        interModal.classList.add('active');
        const dismiss = () => {
            interModal.classList.remove('active');
            if (onClose) onClose();
        };

        const closeBtn = document.getElementById('btnCloseAdmobInter');
        const contBtn = document.getElementById('btnContinueFromAdmobInter');
        if (closeBtn) closeBtn.onclick = dismiss;
        if (contBtn) contBtn.onclick = dismiss;
    }

    handleRewardGranted(amount, type) {
        if (window.soundFX && window.soundFX.playClaimReward) {
            window.soundFX.playClaimReward();
        }
        const ui = window.uiController || window.ludoApp;
        if (ui) {
            if (type === 'gems' || type === 'diamonds') {
                ui.addDiamonds(amount);
            } else {
                ui.addCoins(amount);
            }
        }
        if (this.currentOnSuccess) {
            this.currentOnSuccess(amount, type);
            this.currentOnSuccess = null;
        }
    }
}

// Global AdMob Manager Instance
window.adMobManager = new AdMobManager();
