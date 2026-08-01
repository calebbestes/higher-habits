const appJson = require("./app.json");

const GOOGLE_TEST_AD_PUBLISHER_ID = [
  "ca-app-pub",
  ["3940256", "099942544"].join(""),
].join("-");
const GOOGLE_TEST_ANDROID_APP_ID = `${GOOGLE_TEST_AD_PUBLISHER_ID}~3347511713`;
const GOOGLE_TEST_IOS_APP_ID = `${GOOGLE_TEST_AD_PUBLISHER_ID}~1458002511`;

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

plugins.push([
  "react-native-google-mobile-ads",
  {
    androidAppId: isProductionAdId(androidAppId)
      ? androidAppId
      : GOOGLE_TEST_ANDROID_APP_ID,
    iosAppId: isProductionAdId(iosAppId) ? iosAppId : GOOGLE_TEST_IOS_APP_ID,
    delayAppMeasurementInit: true,
    optimizeInitialization: true,
    optimizeAdLoading: true,
  },
]);

module.exports = {
  ...config,
  plugins,
};
