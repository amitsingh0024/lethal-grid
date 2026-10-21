/**
 * Google Analytics 4 (GA4) & Google AdSense Monetization Service
 *
 * Works in TWO modes automatically:
 * 1. SANDBOX / LOCAL MODE (Default while developing or before AdSense approval):
 *    Logs all GA4 events and simulated ad revenue ($ eCPM) into an in-app telemetry feed
 *    so you can test your ad triggers and see exactly how money & analytics flow.
 * 2. PRODUCTION MODE:
 *    When you set VITE_GA_MEASUREMENT_ID and VITE_ADSENSE_CLIENT_ID in `.env`,
 *    it automatically injects the official Google scripts and sends real events/ads.
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

// In-memory listener list so the in-game Revenue & Analytics Inspector can show live events
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

/**
 * Initialize Google Analytics 4 (gtag.js) and Google AdSense scripts if configured
 */
export function initAnalyticsAndAds() {
  if (typeof window === 'undefined') return;

  // 1. Setup Google Analytics 4
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

  // 2. Setup Google AdSense Script
  if (isRealAdSenseConfigured() && !window.__adsenseInitialized) {
    window.__adsenseInitialized = true;
    const adScript = document.createElement('script');
    adScript.async = true;
    adScript.crossOrigin = 'anonymous';
    adScript.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
    document.head.appendChild(adScript);
  }
}

/**
 * Track a custom Google Analytics 4 event
 */
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

/**
 * Record an ad impression or rewarded ad completion
 */
export function recordAdEvent(placement, isRewarded = false) {
  // Average web game eCPM estimates:
  // Display banner impression ~$0.002 ($2.00 CPM), Rewarded Video completion ~$0.025 ($25.00 CPM)
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
