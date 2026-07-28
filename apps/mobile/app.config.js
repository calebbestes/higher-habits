const appJson = require("./app.json");

const GOOGLE_TEST_AD_PUBLISHER_ID = [
  "ca-app-pub",
  ["3940256", "099425544"].join(""),
].join("-");

function isProductionAdId(value) {
  return Boolean(
    typeof value === "string" &&
      value.trim() &&
      !value.includes(GOOGLE_TEST_AD_PUBLISHER_ID),
  );
}

const config = appJson.expo;
const iosAppId = process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID;
const androidAppId = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID;
const plugins = [...(config.plugins ?? [])];

if (isProductionAdId(iosAppId) && isProductionAdId(androidAppId)) {
  plugins.push([
    "react-native-google-mobile-ads",
    {
      androidAppId,
      iosAppId,
      delayAppMeasurementInit: true,
      optimizeInitialization: true,
      optimizeAdLoading: true,
    },
  ]);
}

module.exports = {
  ...config,
  plugins,
};
