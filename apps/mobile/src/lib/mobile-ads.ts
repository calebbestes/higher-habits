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
    const adsModule = getAdsModule();
    if (!adsModule) return false;

    try {
      await adsModule.default().setRequestConfiguration({
        maxAdContentRating: adsModule.MaxAdContentRating.PG,
        testDeviceIdentifiers: ["EMULATOR"],
      });
      await adsModule.default().initialize();
      return true;
    } catch {
      return false;
    }
  })();

  return initializePromise;
}

export async function loadTestNativeFeedAd(): Promise<LoadedNativeFeedAd | null> {
  const adsModule = getAdsModule();
  if (!adsModule) return null;

  const initialized = await initializeMobileAds();
  if (!initialized) return null;

  try {
    const nativeAd = await adsModule.NativeAd.createForAdRequest(
      adsModule.TestIds.NATIVE,
      {
        adChoicesPlacement: adsModule.NativeAdChoicesPlacement.BOTTOM_RIGHT,
        requestNonPersonalizedAdsOnly: true,
        requestAgent: "float-feed-test",
        startVideoMuted: true,
      },
    );

    return { adsModule, nativeAd };
  } catch {
    return null;
  }
}
