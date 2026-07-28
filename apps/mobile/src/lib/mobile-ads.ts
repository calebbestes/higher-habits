import { Platform } from "react-native";
import type * as GoogleMobileAds from "react-native-google-mobile-ads";

export type GoogleMobileAdsModule = typeof GoogleMobileAds;
export type GoogleNativeAd = GoogleMobileAds.NativeAd;

export type LoadedNativeFeedAd = {
  adsModule: GoogleMobileAdsModule;
  nativeAd: GoogleNativeAd;
};

let cachedAdsModule: GoogleMobileAdsModule | null | undefined;
let initializePromise: Promise<boolean> | null = null;

const GOOGLE_TEST_AD_PUBLISHER_ID = [
  "ca-app-pub",
  ["3940256", "099425544"].join(""),
].join("-");

function getNativeFeedAdUnitId(): string | null {
  const adUnitId = process.env.EXPO_PUBLIC_ADMOB_NATIVE_AD_UNIT_ID?.trim();

  if (!adUnitId || adUnitId.includes(GOOGLE_TEST_AD_PUBLISHER_ID)) {
    return null;
  }

  return adUnitId;
}

export function isNativeFeedAdsEnabled() {
  return Boolean(getNativeFeedAdUnitId());
}

function getAdsModule(): GoogleMobileAdsModule | null {
  if (Platform.OS === "web") return null;
  if (cachedAdsModule !== undefined) return cachedAdsModule;

  try {
    cachedAdsModule =
      require("react-native-google-mobile-ads") as GoogleMobileAdsModule;
  } catch {
    cachedAdsModule = null;
  }

  return cachedAdsModule;
}

export function initializeMobileAds(): Promise<boolean> {
  if (initializePromise) return initializePromise;

  initializePromise = (async () => {
    if (!isNativeFeedAdsEnabled()) return false;

    const adsModule = getAdsModule();
    if (!adsModule) return false;

    try {
      await adsModule.default().setRequestConfiguration({
        maxAdContentRating: adsModule.MaxAdContentRating.PG,
      });
      await adsModule.default().initialize();
      return true;
    } catch {
      return false;
    }
  })();

  return initializePromise;
}

export async function loadNativeFeedAd(): Promise<LoadedNativeFeedAd | null> {
  const adUnitId = getNativeFeedAdUnitId();
  if (!adUnitId) return null;

  const adsModule = getAdsModule();
  if (!adsModule) return null;

  const initialized = await initializeMobileAds();
  if (!initialized) return null;

  try {
    const nativeAd = await adsModule.NativeAd.createForAdRequest(adUnitId, {
      adChoicesPlacement: adsModule.NativeAdChoicesPlacement.BOTTOM_RIGHT,
      requestNonPersonalizedAdsOnly: true,
      requestAgent: "float-feed",
      startVideoMuted: true,
    });

    return { adsModule, nativeAd };
  } catch {
    return null;
  }
}
