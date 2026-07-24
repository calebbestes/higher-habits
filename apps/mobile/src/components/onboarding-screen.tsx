import { Image } from "expo-image";
import { useCallback, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import {
  CelebrationOverlay,
  confettiSource,
} from "@/components/celebration-overlay";
import { DashboardScreen } from "@/components/dashboard-screen";
import {
  type DayPlanOnboardingStep,
  DayPlanScreen,
} from "@/components/day-plan-screen";
import { IncentivesScreen } from "@/components/incentives-screen";
import { SharedGoalsScreen } from "@/components/shared-goals-screen";
import { useTheme } from "@/hooks/use-theme";
import { updateUserSettings } from "@/lib/user-settings-client";

type OnboardingScreenProps = {
  onComplete: () => void;
};

type OnboardingPhase =
  | "day-plan"
  | "incentives"
  | "shared-goals"
  | "dashboard"
  | "welcome";

function useReliablePress(action: () => void, disabled = false) {
  const lockRef = useRef(false);

  return useCallback(() => {
    if (disabled || lockRef.current) return;

    lockRef.current = true;
    action();
    setTimeout(() => {
      lockRef.current = false;
    }, 500);
  }, [action, disabled]);
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const theme = useTheme();
  const [phase, setPhase] = useState<OnboardingPhase>("day-plan");
  const [step, setStep] = useState<DayPlanOnboardingStep>("drag");
  const [createdGoalCheckpointId, setCreatedGoalCheckpointId] = useState<
    string | null
  >(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [celebrationVisible, setCelebrationVisible] = useState(false);

  const handleDayStepChange = (nextStep: DayPlanOnboardingStep) => {
    if (nextStep === "journal-info") {
      setPhase("incentives");
      return;
    }

    setStep(nextStep);
  };

  const complete = async () => {
    if (isCompleting) return;

    setIsCompleting(true);
    try {
      await updateUserSettings({ onboardingCompleted: true });
      onComplete();
    } catch (error) {
      Alert.alert(
        "Onboarding",
        error instanceof Error
          ? error.message
          : "Could not finish onboarding. Please try again.",
      );
      setIsCompleting(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {phase === "day-plan" ? (
        <DayPlanScreen
          onboardingGuide={{
            createdGoalCheckpointId,
            onComplete: complete,
            onGoalCreated: setCreatedGoalCheckpointId,
            onStepChange: handleDayStepChange,
            step,
          }}
        />
      ) : null}
      {phase === "incentives" ? (
        <IncentivesScreen
          onboardingGuide={{
            onSent: () => setPhase("shared-goals"),
            targetFriendName: "Caleb",
          }}
        />
      ) : null}
      {phase === "shared-goals" ? (
        <>
          <SharedGoalsScreen />
          <OnboardingCard
            body="Explore collaborative and competitive goals here. You do not need to create one right now."
            buttonLabel="Next"
            title="Shared goals"
            onPress={() => setPhase("dashboard")}
          />
        </>
      ) : null}
      {phase === "dashboard" || phase === "welcome" ? (
        <>
          <DashboardScreen />
          {phase === "dashboard" ? (
            <OnboardingCard
              body="Review your progress here. This is where Float shows your daily and periodic momentum."
              buttonLabel="Finish"
              title="Dashboard"
              onPress={() => {
                setPhase("welcome");
                setCelebrationVisible(true);
              }}
            />
          ) : (
            <WelcomeCard isCompleting={isCompleting} onPress={complete} />
          )}
          <CelebrationOverlay
            visible={celebrationVisible}
            source={confettiSource}
            onDone={() => setCelebrationVisible(false)}
          />
        </>
      ) : null}
    </View>
  );
}

function OnboardingCard({
  body,
  buttonLabel,
  onPress,
  title,
}: {
  body: string;
  buttonLabel: string;
  onPress: () => void;
  title: string;
}) {
  const theme = useTheme();
  const press = useReliablePress(onPress);

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.background, borderColor: theme.tabBorder },
        ]}
      >
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          {body}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPressIn={press}
          onPress={press}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.primary },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.primaryForeground }]}>
            {buttonLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function WelcomeCard({
  isCompleting,
  onPress,
}: {
  isCompleting: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const press = useReliablePress(onPress, isCompleting);

  return (
    <View style={styles.welcomeOverlay}>
      <View
        style={[
          styles.welcomeCard,
          { backgroundColor: theme.background, borderColor: theme.tabBorder },
        ]}
      >
        <Image
          source={require("@/assets/images/abi-logo-no-background.png")}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={[styles.welcomeTitle, { color: theme.text }]}>
          Welcome to Float
        </Text>
        <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
          Your plan, proof, friends, and progress are ready to lift together.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={isCompleting}
          onPressIn={press}
          onPress={press}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.primary },
            isCompleting && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.primaryForeground }]}>
            Start floating
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  overlay: {
    position: "absolute",
    right: 18,
    bottom: 28,
    left: 18,
    zIndex: 50,
  },
  card: {
    gap: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    padding: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 18,
  },
  cardTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  button: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    marginTop: 6,
    paddingHorizontal: 18,
  },
  buttonText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  welcomeOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 60,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  welcomeCard: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    padding: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 24,
  },
  logo: {
    width: 104,
    height: 104,
  },
  welcomeTitle: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "900",
    textAlign: "center",
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72 },
});
