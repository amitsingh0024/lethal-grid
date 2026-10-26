/**
 * GA4 and AdSense. With VITE_GA_MEASUREMENT_ID and VITE_ADSENSE_CLIENT_ID set, the Google
 * scripts are loaded and events go to GA4. Without them nothing is sent, and events and
 * estimated ad revenue only land in the in-game telemetry feed (see SHOW_DEV_TOOLS).
 */

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-XXXXXXXXXX';
const ADSENSE_CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-0000000000000000';

const isRealGAConfigured = () =>
  Boolean(GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX' && GA_MEASUREMENT_ID.startsWith('G-'));

const isRealAdSenseConfigured = () =>
  Boolean(
    ADSENSE_CLIENT_ID &&
      ADSENSE_CLIENT_ID !== 'ca-pub-0000000000000000' &&
      ADSENSE_CLIENT_ID.startsWith('ca-pub-')
  );

// Owner-only tooling (revenue ledger, sandbox ad labels) shows in dev builds or with ?debug in the URL
export const SHOW_DEV_TOOLS =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug'));

// Recent events, kept in memory for the owner's telemetry panel
const eventListeners = new Set();
const eventLog = [];

export function subscribeToTelemetry(callback) {
  eventListeners.add(callback);
  callback([...eventLog]);
  return () => eventListeners.delete(callback);
}

function pushTelemetryEntry(entry) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString(),
    ...entry,
  };
  eventLog.unshift(item);
  if (eventLog.length > 40) eventLog.pop();
  eventListeners.forEach((cb) => cb([...eventLog]));
}

export function initAnalyticsAndAds() {
  if (typeof window === 'undefined') return;

  if (isRealGAConfigured() && !window.__gaInitialized) {
    window.__gaInitialized = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: true,
      anonymize_ip: true,
    });

    pushTelemetryEntry({
      type: 'SYSTEM',
      name: 'GA4 Live Connected',
      detail: `Measurement ID: ${GA_MEASUREMENT_ID}`,
      estRevenue: 0,
    });
  } else if (!window.__gaSimulatedInit) {
    window.__gaSimulatedInit = true;
    pushTelemetryEntry({
      type: 'SYSTEM',
      name: 'GA4 & AdSense Simulator Ready',
      detail: 'Add real IDs in .env anytime to switch from Sandbox to Live Google servers.',
      estRevenue: 0,
    });
  }

  if (isRealAdSenseConfigured() && !window.__adsenseInitialized) {
    window.__adsenseInitialized = true;
    const adScript = document.createElement('script');
    adScript.async = true;
    adScript.crossOrigin = 'anonymous';
    // H5 Games Ads: at most one interstitial-style break a minute; test ads until approved
    adScript.dataset.adFrequencyHint = '60s';
    if (import.meta.env.VITE_ADBREAK_TEST === 'on') adScript.dataset.adbreakTest = 'on';
    adScript.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
    document.head.appendChild(adScript);
    initAdPlacementApi();
  }
}

// Google H5 Games Ads (Ad Placement API). adBreak and adConfig queue onto adsbygoogle until
// the script loads, so they can be called right away.
function initAdPlacementApi() {
  window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = window.adConfig = function adPlacement(o) {
    window.adsbygoogle.push(o);
  };
  window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
}

export function trackEvent(eventName, params = {}) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function' && isRealGAConfigured()) {
    window.gtag('event', eventName, params);
  }

  pushTelemetryEntry({
    type: 'GA4_EVENT',
    name: eventName,
    detail: Object.entries(params)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', '),
    estRevenue: 0,
  });
}

export function recordAdEvent(placement, isRewarded = false) {
  // Rough web game rates: $2 CPM for a banner, $25 CPM for a rewarded video
  const estRevenue = isRewarded ? 0.025 : 0.002;

  trackEvent(isRewarded ? 'rewarded_ad_complete' : 'ad_impression', {
    placement,
    ad_type: isRewarded ? 'rewarded_video' : 'display_banner',
    estimated_value_usd: estRevenue,
  });

  pushTelemetryEntry({
    type: isRewarded ? 'REWARDED_AD' : 'BANNER_AD',
    name: isRewarded ? 'Rewarded Video Completed' : 'Banner Ad Impression',
    detail: `Slot: ${placement}`,
    estRevenue,
  });

  return estRevenue;
}

export function getMonetizationConfig() {
  return {
    gaMeasurementId: GA_MEASUREMENT_ID,
    adsenseClientId: ADSENSE_CLIENT_ID,
    isLiveGA: isRealGAConfigured(),
    isLiveAdSense: isRealAdSenseConfigured(),
  };
}
