function parseBooleanFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function normalizeBaseUrl(value: string | undefined) {
  if (!value) {
    return "http://localhost:4000";
  }

  return value.replace(/\/+$/, "");
}

export const frontendConfig = {
  apiBaseUrl: normalizeBaseUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL,
  ),
  flags: {
    useNewAuth: parseBooleanFlag(process.env.NEXT_PUBLIC_USE_NEW_AUTH, true),
    useNewVerification: parseBooleanFlag(
      process.env.NEXT_PUBLIC_USE_NEW_VERIFICATION,
      true,
    ),
    useNewRides: parseBooleanFlag(process.env.NEXT_PUBLIC_USE_NEW_RIDES, true),
    useNewBookings: parseBooleanFlag(
      process.env.NEXT_PUBLIC_USE_NEW_BOOKINGS,
      true,
    ),
    useNewSettlements: parseBooleanFlag(
      process.env.NEXT_PUBLIC_USE_NEW_SETTLEMENTS,
      true,
    ),
    useNewPayments: parseBooleanFlag(
      process.env.NEXT_PUBLIC_USE_NEW_PAYMENTS,
      true,
    ),
    enableCommunityUi: parseBooleanFlag(
      process.env.NEXT_PUBLIC_ENABLE_COMMUNITY_UI,
      false,
    ),
    enableRatingsUi: parseBooleanFlag(
      process.env.NEXT_PUBLIC_ENABLE_RATINGS_UI,
      false,
    ),
    enableChatUi: parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_CHAT_UI, true),
    enableTrackingUi: parseBooleanFlag(
      process.env.NEXT_PUBLIC_ENABLE_TRACKING_UI,
      false,
    ),
  },
};
