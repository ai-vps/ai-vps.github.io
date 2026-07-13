/**
 * 全站预加载脚本
 * 策略：导航链接即时预加载 → 可见链接预加载 → 空闲时批量预加载
 */
(function () {
  'use strict';

  var ORIGIN = location.origin;
  var prefetched = {};

  // 已预加载的页面缓存
  var cache = {};

  /**
   * 预加载单个页面
   */
  function prefetch(url) {
    if (prefetched[url] || !url || url.indexOf(ORIGIN) !== 0) return;
    if (url.indexOf('.html') === -1 && url.indexOf('/') !== url.length - 1) return;
    prefetched[url] = true;

    // 用 fetch 预加载（Cloudflare CDN 会缓存）
    fetch(url, { credentials: 'same-origin', priority: 'low' })
      .then(function (res) { return res.text(); })
      .then(function (html) { cache[url] = html; })
      .catch(function () {});
  }

  /**
   * 预加载导航栏链接（最高优先级）
   */
  function prefetchNav() {
    var navLinks = document.querySelectorAll('nav a, .nav a, .nav-inner a');
    for (var i = 0; i < navLinks.length; i++) {
      prefetch(navLinks[i].href);
    }
  }

  /**
   * 预加载首屏可见链接
   */
  function prefetchVisible() {
    var links = document.querySelectorAll('a[href$=".html"]');
    if (!links.length) return;

    // IntersectionObserver 支持检测
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            prefetch(entries[i].target.href);
            observer.unobserve(entries[i].target);
          }
        }
      }, { rootMargin: '200px' });

      for (var i = 0; i < links.length; i++) {
        observer.observe(links[i]);
      }
    } else {
      // 降级：直接预加载前 30 个链接
      var limit = Math.min(links.length, 30);
      for (var i = 0; i < limit; i++) {
        prefetch(links[i].href);
      }
    }
  }

  /**
   * 空闲时批量预加载剩余链接
   */
  function prefetchIdle() {
    var links = document.querySelectorAll('a[href$=".html"]');
    var queue = [];
    for (var i = 0; i < links.length; i++) {
      if (!prefetched[links[i].href]) {
        queue.push(links[i].href);
      }
    }
    if (!queue.length) return;

    var idx = 0;
    function processNext(deadline) {
      while (idx < queue.length && (deadline.timeRemaining() > 5 || deadline.didTimeout)) {
        prefetch(queue[idx++]);
      }
      if (idx < queue.length && 'requestIdleCallback' in window) {
        requestIdleCallback(processNext, { timeout: 2000 });
      }
    }

    if ('requestIdleCallback' in window) {
      requestIdleCallback(processNext, { timeout: 3000 });
    } else {
      // 降级：setTimeout 分批加载
      var batch = 5;
      function fallback() {
        for (var i = 0; i < batch && idx < queue.length; i++) {
          prefetch(queue[idx++]);
        }
        if (idx < queue.length) setTimeout(fallback, 200);
      }
      fallback();
    }
  }

  /**
   * 鼠标悬停预加载（即时触发）
   */
  function hoverPrefetch() {
    document.addEventListener('mouseover', function (e) {
      var link = e.target.closest('a[href$=".html"]');
      if (link) prefetch(link.href);
    }, { passive: true });

    document.addEventListener('touchstart', function (e) {
      var link = e.target.closest('a[href$=".html"]');
      if (link) prefetch(link.href);
    }, { passive: true });
  }

  /**
   * 注入 <link rel="prefetch"> 给首屏链接（利用浏览器原生预加载）
   */
  function injectLinkPrefetch() {
    var navLinks = document.querySelectorAll('nav a, .nav a, .nav-inner a');
    var head = document.head;
    for (var i = 0; i < navLinks.length; i++) {
      var url = navLinks[i].href;
      if (prefetched[url]) continue;
      prefetched[url] = true;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      link.as = 'document';
      head.appendChild(link);
    }
  }

  // 执行策略
  // 1. 立即注入 <link rel="prefetch"> （浏览器级预加载）
  injectLinkPrefetch();

  // 2. 立即 fetch 预加载导航链接
  prefetchNav();

  // 3. DOM 就绪后处理可见链接
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      prefetchVisible();
      hoverPrefetch();
    });
  } else {
    prefetchVisible();
    hoverPrefetch();
  }

  // 4. 页面完全加载后，空闲时批量预加载
  if (window.addEventListener) {
    window.addEventListener('load', function () {
      setTimeout(prefetchIdle, 1500);
    });
  } else {
    window.attachEvent('onload', function () {
      setTimeout(prefetchIdle, 1500);
    });
  }
})();
