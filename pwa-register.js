// PWA Registration and Install Prompt Handler
(function() {
  'use strict';

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then((registration) => {
          console.log('✅ Service Worker registered:', registration.scope);

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            console.log('🔄 Service Worker update found');

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New content available, show update prompt
                showUpdatePrompt();
              }
            });
          });
        })
        .catch((error) => {
          console.error('❌ Service Worker registration failed:', error);
        });

      // Handle controller change (when update is applied)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    });
  }

  // Install Prompt Handler
  let deferredPrompt;
  let installButton;

  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('📱 Install prompt available');
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    console.log('✅ App installed successfully');
    hideInstallButton();
    deferredPrompt = null;
  });

  function showInstallButton() {
    // Create install button if it doesn't exist
    if (!installButton) {
      installButton = document.createElement('button');
      installButton.id = 'pwa-install-btn';
      installButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>Install App</span>
      `;
      installButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px;
        background: linear-gradient(135deg, #f4a261, #e76f51);
        color: white;
        border: none;
        border-radius: 50px;
        font-family: inherit;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(244, 162, 97, 0.4);
        transition: all 0.3s ease;
        z-index: 9999;
      `;
      
      installButton.addEventListener('mouseenter', () => {
        installButton.style.transform = 'translateX(-50%) scale(1.05)';
        installButton.style.boxShadow = '0 6px 25px rgba(244, 162, 97, 0.5)';
      });
      
      installButton.addEventListener('mouseleave', () => {
        installButton.style.transform = 'translateX(-50%) scale(1)';
        installButton.style.boxShadow = '0 4px 20px rgba(244, 162, 97, 0.4)';
      });
      
      installButton.addEventListener('click', promptInstall);
      document.body.appendChild(installButton);
    }
    installButton.style.display = 'flex';
  }

  function hideInstallButton() {
    if (installButton) {
      installButton.style.display = 'none';
    }
  }

  async function promptInstall() {
    if (!deferredPrompt) {
      console.log('Install prompt not available');
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`Install prompt outcome: ${outcome}`);
    
    if (outcome === 'accepted') {
      hideInstallButton();
    }
    deferredPrompt = null;
  }

  // Update Prompt
  function showUpdatePrompt() {
    const updateBanner = document.createElement('div');
    updateBanner.id = 'pwa-update-banner';
    updateBanner.innerHTML = `
      <span>🎮 New version available!</span>
      <button id="pwa-update-btn">Update Now</button>
    `;
    updateBanner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #2a9d8f, #264653);
      color: white;
      font-family: inherit;
      font-size: 14px;
      z-index: 10000;
      animation: slideDown 0.3s ease;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideDown {
        from { transform: translateY(-100%); }
        to { transform: translateY(0); }
      }
      #pwa-update-btn {
        padding: 8px 16px;
        background: white;
        color: #264653;
        border: none;
        border-radius: 20px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
      }
      #pwa-update-btn:hover {
        transform: scale(1.05);
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(updateBanner);

    document.getElementById('pwa-update-btn').addEventListener('click', () => {
      navigator.serviceWorker.ready.then((registration) => {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    });
  }

  // iOS Install Instructions (Safari doesn't support beforeinstallprompt)
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isInStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  if (isIOS() && !isInStandaloneMode()) {
    // Show iOS-specific install instructions after a delay
    setTimeout(() => {
      const iosBanner = document.createElement('div');
      iosBanner.id = 'ios-install-banner';
      iosBanner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 24px;">📲</span>
          <div>
            <strong>Install Møbee</strong>
            <p style="margin: 4px 0 0; font-size: 12px; opacity: 0.9;">
              Tap <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> then "Add to Home Screen"
            </p>
          </div>
          <button id="ios-dismiss" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 4px;">×</button>
        </div>
      `;
      iosBanner.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        padding: 16px;
        background: linear-gradient(135deg, #264653, #1a1a2e);
        color: white;
        border-radius: 16px;
        font-family: inherit;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        z-index: 9999;
        animation: slideUp 0.3s ease;
      `;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(iosBanner);

      document.getElementById('ios-dismiss').addEventListener('click', () => {
        iosBanner.remove();
        localStorage.setItem('mobee-ios-banner-dismissed', 'true');
      });
    }, 3000);
  }
})();
