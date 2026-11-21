/*! kira-motion 1.0.0 | Kira Code motion kit | MIT */
/*
 * Scroll and entrance motion driven by HTML attributes, with no dependencies.
 * Load it at the end of <body> together with kira-motion.css:
 *
 *   <link rel="stylesheet" href="kira-kit/kira-motion.css">
 *   <script src="kira-kit/kira-motion.js" defer></script>
 *
 * Attributes:
 *   data-motion="fade-up|fade-down|fade-left|fade-right|fade|zoom|blur"
 *                              reveal when the element scrolls into view
 *   data-motion-delay="150"    extra delay in ms
 *   data-motion-stagger="80"   on a parent: reveal its data-motion children one
 *                              after another, this many ms apart
 *   data-split="words|chars"   split a heading's text so it reveals word by word
 *                              (use with data-motion on the same element)
 *   data-count-to="1200"       count up from 0 when seen; data-count-prefix,
 *                              data-count-suffix, data-count-decimals optional
 *   data-parallax="0.2"        move slower (positive) or faster (negative) than
 *                              the page while scrolling; keep between -0.5 and 0.5
 *   data-marquee="40"          scroll the children sideways forever, px per second
 *   data-progress              a bar whose width follows how far the page is read
 *   data-header-scrolled       gets the class "is-scrolled" once the page scrolls
 *
 * Content is never hidden unless this script runs: the hiding styles apply only
 * under html.kira-motion, which this file adds. People who ask their system for
 * reduced motion see everything at once, with nothing moving.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__kiraMotion) return;
  window.__kiraMotion = true;

  var root = document.documentElement;
  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function splitText(el) {
    var mode = el.getAttribute('data-split') === 'chars' ? 'chars' : 'words';
    if (el.getAttribute('data-split-done')) return;
    el.setAttribute('data-split-done', '1');
    el.setAttribute('aria-label', el.textContent.trim());
    var parts = mode === 'chars' ? el.textContent.split('') : el.textContent.split(/(\s+)/);
    el.textContent = '';
    var i = 0;
    parts.forEach(function (part) {
      if (/^\s+$/.test(part)) {
        el.appendChild(document.createTextNode(part));
        return;
      }
      var span = document.createElement('span');
      span.className = 'km-piece';
      span.setAttribute('aria-hidden', 'true');
      span.style.setProperty('--km-i', String(i++));
      span.textContent = part;
      el.appendChild(span);
    });
  }

  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count-to'));
    if (isNaN(target)) return;
    var decimals = parseInt(el.getAttribute('data-count-decimals') || '0', 10);
    var prefix = el.getAttribute('data-count-prefix') || '';
    var suffix = el.getAttribute('data-count-suffix') || '';
    var format = function (n) {
      return prefix + n.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) + suffix;
    };
    if (reduced) {
      el.textContent = format(target);
      return;
    }
    var start = null;
    var duration = 1400;
    function step(time) {
      if (start === null) start = time;
      var t = Math.min(1, (time - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(target * eased);
      if (t < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  function reveal(el) {
    if (el.classList.contains('is-in')) return;
    el.classList.add('is-in');
    if (el.hasAttribute('data-count-to')) countUp(el);
    all('[data-count-to]', el).forEach(countUp);
  }

  function setUpReveals() {
    all('[data-split]').forEach(splitText);
    all('[data-motion-stagger]').forEach(function (parent) {
      var gap = parseInt(parent.getAttribute('data-motion-stagger'), 10) || 80;
      all('[data-motion]', parent).forEach(function (child, index) {
        if (!child.hasAttribute('data-motion-delay')) {
          child.setAttribute('data-motion-delay', String(index * gap));
        }
      });
    });
    all('[data-motion-delay]').forEach(function (el) {
      el.style.setProperty('--km-delay', (parseInt(el.getAttribute('data-motion-delay'), 10) || 0) + 'ms');
    });

    var targets = all('[data-motion], [data-count-to]');
    if (reduced || !('IntersectionObserver' in window)) {
      targets.forEach(reveal);
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            reveal(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    targets.forEach(function (el) {
      observer.observe(el);
    });
    // Anything already on screen at load, and a safety net: never leave
    // content hidden if the observer did not fire for some reason.
    window.setTimeout(function () {
      targets.forEach(function (el) {
        var box = el.getBoundingClientRect();
        if (box.top < window.innerHeight && box.bottom > 0) reveal(el);
      });
    }, 60);
    window.setTimeout(function () {
      targets.forEach(reveal);
    }, 8000);
  }

  function setUpMarquees() {
    all('[data-marquee]').forEach(function (el) {
      if (el.getAttribute('data-marquee-done')) return;
      el.setAttribute('data-marquee-done', '1');
      var speed = parseFloat(el.getAttribute('data-marquee')) || 40;
      var track = document.createElement('div');
      track.className = 'km-marquee-track';
      while (el.firstChild) track.appendChild(el.firstChild);
      var copy = track.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      var row = document.createElement('div');
      row.className = 'km-marquee-row';
      row.appendChild(track);
      row.appendChild(copy);
      el.appendChild(row);
      window.requestAnimationFrame(function () {
        var width = track.getBoundingClientRect().width || 1;
        row.style.setProperty('--km-marquee-duration', width / speed + 's');
      });
    });
  }

  var parallax = [];
  var progress = [];
  var headers = [];
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      var y = window.pageYOffset || root.scrollTop;
      var max = Math.max(1, root.scrollHeight - window.innerHeight);
      progress.forEach(function (bar) {
        bar.style.transform = 'scaleX(' + Math.min(1, y / max) + ')';
      });
      headers.forEach(function (header) {
        header.classList.toggle('is-scrolled', y > 12);
      });
      parallax.forEach(function (item) {
        var box = item.el.parentElement
          ? item.el.parentElement.getBoundingClientRect()
          : item.el.getBoundingClientRect();
        var fromCentre = box.top + box.height / 2 - window.innerHeight / 2;
        item.el.style.transform = 'translate3d(0,' + (fromCentre * item.speed).toFixed(1) + 'px,0)';
      });
    });
  }

  function setUpScroll() {
    progress = all('[data-progress]');
    headers = all('[data-header-scrolled]');
    if (!reduced) {
      parallax = all('[data-parallax]').map(function (el) {
        var speed = parseFloat(el.getAttribute('data-parallax'));
        if (isNaN(speed)) speed = 0.2;
        return { el: el, speed: Math.max(-0.5, Math.min(0.5, speed)) * -1 };
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  function start() {
    root.classList.add('kira-motion');
    if (reduced) root.classList.add('kira-motion-reduced');
    setUpReveals();
    setUpMarquees();
    setUpScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // For pages that add content later: KiraMotion.refresh() picks it up.
  window.KiraMotion = {
    refresh: function () {
      setUpReveals();
      setUpMarquees();
      setUpScroll();
    },
  };
})();
