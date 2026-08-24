(() => {
  'use strict';

  let classLabel = '4학년 1반';
  let galleryEnabled = true;
  const originalShowView = window.showView;

  if (typeof originalShowView === 'function') {
    window.showView = function showTenantView(name) {
      if (name === 'gallery' && !galleryEnabled) {
        window.showToast?.('선생님이 우리 반 갤러리를 사용하지 않도록 설정했습니다.');
        return;
      }
      return originalShowView.apply(this, arguments);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
      replaceClassLabels(document.body);
      enforceGallerySetting();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    void refreshTenantUi();
  });

  async function refreshTenantUi() {
    try {
      const response = await fetch('/api/session', { credentials: 'same-origin' });
      const result = await response.json();
      if (!result.authenticated) return;
      if (typeof result.classLabel === 'string' && result.classLabel.trim()) {
        classLabel = result.classLabel.trim();
      }
      galleryEnabled = result.galleryEnabled !== false;
      replaceClassLabels(document.body);
      enforceGallerySetting();
      const banner = document.getElementById('sessionBanner');
      if (banner) {
        banner.textContent = galleryEnabled
          ? `✓ ${classLabel} 수업 참여가 확인되었습니다. 사진 제출과 우리 반 갤러리를 이용할 수 있어요.`
          : `✓ ${classLabel} 수업 참여가 확인되었습니다. 사진 제출은 가능하며, 우리 반 갤러리는 선생님이 닫아 두었습니다.`;
      }
    } catch {
      // The original page already handles an unavailable session endpoint.
    }
  }

  function enforceGallerySetting() {
    const button = document.querySelector('[data-view="gallery"]');
    if (!(button instanceof HTMLButtonElement)) return;
    if (!galleryEnabled) {
      if (!button.disabled) button.disabled = true;
      if (button.getAttribute('aria-disabled') !== 'true') button.setAttribute('aria-disabled', 'true');
      if (!button.classList.contains('opacity-45')) button.classList.add('opacity-45');
      if (!button.classList.contains('cursor-not-allowed')) button.classList.add('cursor-not-allowed');
      if (button.textContent !== '전체보기 (닫힘)') button.textContent = '전체보기 (닫힘)';
    }
  }

  function replaceClassLabels(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.nodeValue && node.nodeValue.includes('4학년 1반')) {
        node.nodeValue = node.nodeValue.replaceAll('4학년 1반', classLabel);
      }
    }
  }
})();
