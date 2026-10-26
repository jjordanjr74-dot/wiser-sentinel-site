(function() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/wiser-sentinel-site/sw.js').catch(function() {});
    });
  }
  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true
    || /ShebaNativeAndroid/i.test(navigator.userAgent || '');
  if (isStandalone) return;
  if (sessionStorage.getItem('sheba_app_bar_dismissed_wiser') === '1') return;

  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  function injectBar() {
    if (document.getElementById('sheba-mobile-app-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'sheba-mobile-app-bar';
    bar.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:9998;display:flex;align-items:center;gap:8px;background:#0a0e17;color:#ffffff;border:1px solid #f59e0b;border-radius:999px;padding:7px 12px;box-shadow:0 10px 28px rgba(0,0,0,0.45);font-family:system-ui,-apple-system,sans-serif;font-size:12.5px;line-height:1.2;max-width:calc(100vw - 32px);';
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '') && !window.MSStream;

    var installBtn = document.createElement('button');
    installBtn.type = 'button';
    installBtn.textContent = isIOS ? '📱 Install iOS App' : '📱 Install App';
    installBtn.style.cssText = 'background:#f59e0b;color:#fff;border:none;border-radius:999px;padding:6px 11px;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap;';
    installBtn.onclick = function() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function() { deferredPrompt = null; });
      } else if (isIOS) {
        alert('To install WISER 2.6 on iPhone/iPad:\n\n1. Tap the Share button (⬆️) at the bottom of Safari.\n2. Scroll down and tap "Add to Home Screen" (➕).');
      } else {
        window.location.href = '/wiser-sentinel-site/downloads/wiser.apk';
      }
    };

    var apkLink = document.createElement('a');
    apkLink.href = '/wiser-sentinel-site/downloads/wiser.apk';
    apkLink.setAttribute('download', 'wiser.apk');
    apkLink.textContent = '⬇ Android APK';
    apkLink.style.cssText = 'color:#e2e8f0;text-decoration:none;font-weight:600;font-size:11.5px;padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,0.22);white-space:nowrap;';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Dismiss mobile app bar');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:transparent;color:#94a3b8;border:none;font-size:13px;cursor:pointer;padding:2px 4px;';
    closeBtn.onclick = function() {
      sessionStorage.setItem('sheba_app_bar_dismissed_wiser', '1');
      bar.remove();
    };

    bar.appendChild(installBtn);
    bar.appendChild(apkLink);
    bar.appendChild(closeBtn);
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBar);
  } else {
    injectBar();
  }
})();
