import * as Contacts from "expo-contacts";
import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EXPO_SYMBOL_ICON_OPTIONS } from "@/components/goal-icon";
import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { setGoalLog, setGoalLogNote, toDateKey } from "@/lib/goal-logs-client";
import { pickGoalPhoto, type GoalPhotoSource } from "@/lib/goal-photo-picker";
import { uploadGoalPhoto } from "@/lib/goal-photos-client";
import {
  createCategory,
  createHabit,
  fetchCategories,
  type Habit,
  type HabitInput,
  type HabitPeriod,
} from "@/lib/habits-client";
import { createPlanGoal } from "@/lib/planning-goals-client";
import {
  createTask,
  todayDateKey,
  type Task,
  type TaskInput,
  updateTask,
} from "@/lib/tasks-client";
import { updateUserSettings } from "@/lib/user-settings-client";

type SymbolName = SymbolViewProps["name"];
type SetupStepKey = "create" | "proof" | "friends";
type FirstItemKind = "daily_habit" | "monthly_habit" | "goal" | "task";

type ContactInvite = {
  id: string;
  name: string;
  phoneNumber: string;
};

type CreatedItem = {
  kind: FirstItemKind;
  title: string;
  habit?: Habit;
  task?: Task;
  taskInput?: TaskInput;
};

type FirstItemOption = {
  key: FirstItemKind;
  label: string;
  placeholder: string;
  actionLabel: string;
  successLabel: string;
  icon: SymbolName;
};

type TourStep = {
  key: string;
  label: string;
  title: string;
  detail: string;
  icon: SymbolName;
};

type OnboardingScreenProps = {
  onComplete: () => void;
};

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

const SETUP_STEPS: Array<{
  key: SetupStepKey;
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: SymbolName;
}> = [
  {
    key: "create",
    eyebrow: "Step 1",
    title: "Add your first thing",
    subtitle: "Choose what you want to start with, then give it a name.",
    icon: sym("plus.circle.fill", "add_circle"),
  },
  {
    key: "proof",
    eyebrow: "Step 2",
    title: "Take a proof photo",
    subtitle: "Snap a picture while you do it and mark today complete.",
    icon: sym("camera.fill", "photo_camera"),
  },
  {
    key: "friends",
    eyebrow: "Step 3",
    title: "Share with friends",
    subtitle: "Send a text invite to someone from your contacts.",
    icon: sym("person.2.fill", "groups"),
  },
];

const FIRST_ITEM_OPTIONS: FirstItemOption[] = [
  {
    key: "daily_habit",
    label: "Daily habit",
    placeholder: "Read for 10 minutes",
    actionLabel: "Add daily habit",
    successLabel: "Daily habit added.",
    icon: sym("sun.max.fill", "wb_sunny"),
  },
  {
    key: "monthly_habit",
    label: "Monthly habit",
    placeholder: "Deep clean my room",
    actionLabel: "Add monthly habit",
    successLabel: "Monthly habit added.",
    icon: sym("calendar", "calendar_month"),
  },
  {
    key: "goal",
    label: "Goal",
    placeholder: "Finish a book this month",
    actionLabel: "Add goal",
    successLabel: "Goal added.",
    icon: sym("target", "my_location"),
  },
  {
    key: "task",
    label: "Task",
    placeholder: "Send the email",
    actionLabel: "Add task",
    successLabel: "Task added.",
    icon: sym("checklist", "checklist"),
  },
];

const TOUR_STEPS: TourStep[] = [
  {
    key: "plan-report",
    label: "Plan/Report",
    title: "Plan/Report",
    detail: "Add habits, goals, tasks, and decide what gets attention today.",
    icon: sym("calendar.badge.clock", "event_note"),
  },
  {
    key: "journal",
    label: "Journal",
    title: "Journal",
    detail: "Look back at notes, photos, and the story of your progress.",
    icon: sym("book.fill", "menu_book"),
  },
  {
    key: "collab",
    label: "Collab",
    title: "Collab",
    detail: "Find friends, share goals, send props, and see their progress.",
    icon: sym("person.2.fill", "groups"),
  },
  {
    key: "dashboard",
    label: "Dashboard",
    title: "Dashboard",
    detail: "Check daily and monthly completion at a glance.",
    icon: sym("gauge.with.dots.needle.50percent", "speed"),
  },
  {
    key: "settings",
    label: "Settings",
    title: "Settings",
    detail: "Tune notifications, account details, and integrations.",
    icon: sym("gearshape.fill", "settings"),
  },
];

const INVITE_MESSAGE =
  "Hey! I'm using float to build my habits. You should make a goal with me!";

function selectedOption(kind: FirstItemKind) {
  return (
    FIRST_ITEM_OPTIONS.find((option) => option.key === kind) ??
    FIRST_ITEM_OPTIONS[0]
  );
}

function buildHabitInput({
  categoryId,
  goalId = null,
  name,
  period,
}: {
  categoryId: string;
  goalId?: string | null;
  name: string;
  period: HabitPeriod;
}): HabitInput {
  return {
    name,
    frequencyGoal: 1,
    period,
    repeatInterval: 1,
    repeatDays: period === "weekly" ? [new Date().getDay()] : null,
    repeatMonthlyType: "day_of_month",
    categoryId,
    goalId,
    priority: "high",
    visibility: "only_me",
    iconKey: EXPO_SYMBOL_ICON_OPTIONS[0]?.key ?? "target",
    reminderEnabled: false,
    reminderTime: null,
    hidden: false,
  };
}

function buildTaskInput(name: string): TaskInput {
  return {
    name,
    importance: "High",
    dueDate: todayDateKey(),
    completedAt: null,
    timeRequired: "~30 min",
    projectId: null,
  };
}

async function getHabitCategoryId() {
  const categories = await fetchCategories();
  if (categories[0]) return categories[0].id;

  try {
    const category = await createCategory({
      name: "Personal",
      icon: "person.fill",
    });
    return category.id;
  } catch (error) {
    const freshCategories = await fetchCategories();
    if (freshCategories[0]) return freshCategories[0].id;
    throw error;
  }
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const theme = useTheme();
  const [setupIndex, setSetupIndex] = useState(0);
  const [tourIndex, setTourIndex] = useState(0);
  const [isTouring, setIsTouring] = useState(false);
  const [firstItemKind, setFirstItemKind] =
    useState<FirstItemKind>("daily_habit");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [itemName, setItemName] = useState("");
  const [createdItem, setCreatedItem] = useState<CreatedItem | null>(null);
  const [proofCompleted, setProofCompleted] = useState(false);
  const [proofNote, setProofNote] = useState("");
  const [proofNoteSaved, setProofNoteSaved] = useState(false);
  const [contactState, setContactState] = useState<
    "idle" | "loading" | "granted" | "denied"
  >("idle");
  const [contacts, setContacts] = useState<ContactInvite[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [inviteSent, setInviteSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setupStep = SETUP_STEPS[setupIndex];
  const activeOption = selectedOption(firstItemKind);
  const tourStep = TOUR_STEPS[tourIndex];
  const trimmedItemName = itemName.trim();
  const canCreate =
    trimmedItemName.length > 0 && !isSubmitting && !isCompleting;
  const canNavigate = !isSubmitting && !isCompleting;
  const filteredContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase();
    if (!query) return contacts.slice(0, 24);
    return contacts
      .filter(
        (contact) =>
          contact.name.toLowerCase().includes(query) ||
          contact.phoneNumber.includes(query),
      )
      .slice(0, 24);
  }, [contactQuery, contacts]);

  const complete = async () => {
    if (isCompleting) return;

    setError(null);
    setIsCompleting(true);
    try {
      await updateUserSettings({ onboardingCompleted: true });
      onComplete();
    } catch {
      setError("Could not save your setup. Try once more.");
    } finally {
      setIsCompleting(false);
    }
  };

  const createFirstItem = async () => {
    if (!canCreate) return;

    setError(null);
    setIsSubmitting(true);
    try {
      if (firstItemKind === "task") {
        const taskInput = buildTaskInput(trimmedItemName);
        const task = await createTask(taskInput);
        setCreatedItem({
          kind: firstItemKind,
          title: task.name,
          task,
          taskInput,
        });
      } else if (firstItemKind === "goal") {
        const categoryId = await getHabitCategoryId();
        const goal = await createPlanGoal({
          title: trimmedItemName,
          checkpoints: [],
        });
        const habit = await createHabit(
          buildHabitInput({
            categoryId,
            goalId: goal.id,
            name: `Work on ${trimmedItemName}`,
            period: "daily",
          }),
        );
        setCreatedItem({
          kind: firstItemKind,
          title: goal.title,
          habit,
        });
      } else {
        const categoryId = await getHabitCategoryId();
        const habit = await createHabit(
          buildHabitInput({
            categoryId,
            name: trimmedItemName,
            period: firstItemKind === "monthly_habit" ? "monthly" : "daily",
          }),
        );
        setCreatedItem({
          kind: firstItemKind,
          title: habit.name,
          habit,
        });
      }
      setProofCompleted(false);
      setProofNote("");
      setProofNoteSaved(false);
      setItemName("");
      setIsDropdownOpen(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not add that yet.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const completeCreatedTask = async (item: CreatedItem) => {
    if (!item.task || !item.taskInput) return;

    const completedAt = new Date().toISOString();
    const taskInput = { ...item.taskInput, completedAt };
    const task = await updateTask(item.task.id, taskInput);
    setCreatedItem((current) =>
      current
        ? {
            ...current,
            task,
            taskInput,
          }
        : current,
    );
  };

  const saveProofPhoto = async (source: GoalPhotoSource) => {
    if (!createdItem || isSubmitting || isCompleting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const photo = await pickGoalPhoto(source);
      if (!photo) return;

      if (createdItem.habit) {
        const dateKey = toDateKey(new Date());
        await uploadGoalPhoto(createdItem.habit.id, dateKey, photo);
        await setGoalLog(createdItem.habit.id, dateKey, "complete");
      } else {
        await completeCreatedTask(createdItem);
      }

      setProofCompleted(true);
    } catch (proofError) {
      setError(
        proofError instanceof Error
          ? proofError.message
          : "Could not save that photo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveProofNote = async () => {
    const note = proofNote.trim();
    if (!createdItem || !note || isSubmitting || isCompleting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      if (createdItem.habit) {
        const dateKey = toDateKey(new Date());
        await setGoalLogNote(createdItem.habit.id, dateKey, note);
        await setGoalLog(createdItem.habit.id, dateKey, "complete");
      } else {
        await completeCreatedTask(createdItem);
      }
      setProofNoteSaved(true);
      setProofCompleted(true);
      setProofNote("");
    } catch (noteError) {
      setError(
        noteError instanceof Error
          ? noteError.message
          : "Could not save that note.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadContacts = async () => {
    if (contactState === "loading") return;

    setError(null);
    setContactState("loading");
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setContactState("denied");
        setError("Contacts access is off. Enable it to choose someone to text.");
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });
      const seen = new Set<string>();
      const nextContacts: ContactInvite[] = [];

      for (const contact of data) {
        const name =
          contact.name?.trim() ||
          [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
          "Contact";
        const phoneNumber = contact.phoneNumbers?.find((entry) =>
          Boolean(entry.number?.trim()),
        )?.number;
        if (!phoneNumber) continue;

        const normalizedPhone = phoneNumber.replace(/[^\d+]/g, "");
        if (!normalizedPhone || seen.has(normalizedPhone)) continue;

        seen.add(normalizedPhone);
        nextContacts.push({
          id: contact.id ?? normalizedPhone,
          name,
          phoneNumber: normalizedPhone,
        });
      }

      setContacts(
        nextContacts.sort((left, right) => left.name.localeCompare(right.name)),
      );
      setContactState("granted");
      if (nextContacts.length === 0) {
        setError("No contacts with phone numbers were found.");
      }
    } catch {
      setContactState("idle");
      setError("Could not load contacts. Try once more.");
    }
  };

  const inviteContact = async (contact: ContactInvite) => {
    if (isSubmitting || isCompleting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const separator = Platform.OS === "ios" ? "&" : "?";
      await Linking.openURL(
        `sms:${contact.phoneNumber}${separator}body=${encodeURIComponent(
          INVITE_MESSAGE,
        )}`,
      );
      setInviteSent(true);
    } catch {
      setError("Could not open Messages on this device.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const goBack = () => {
    if (!canNavigate) return;
    setError(null);

    if (isTouring) {
      if (tourIndex > 0) {
        setTourIndex((current) => current - 1);
      } else {
        setIsTouring(false);
        setSetupIndex(SETUP_STEPS.length - 1);
      }
      return;
    }

    if (setupIndex > 0) setSetupIndex((current) => current - 1);
  };

  const goNext = () => {
    if (!canNavigate) return;
    setError(null);

    if (isTouring) {
      if (tourIndex === TOUR_STEPS.length - 1) {
        void complete();
      } else {
        setTourIndex((current) => current + 1);
      }
      return;
    }

    if (setupIndex === 0 && !createdItem) return;
    if (setupIndex < SETUP_STEPS.length - 1) {
      setSetupIndex((current) => current + 1);
      return;
    }

    setIsTouring(true);
    setTourIndex(0);
  };

  const canUseNext = isTouring || setupIndex !== 0 || Boolean(createdItem);
  const primaryLabel = isTouring
    ? tourIndex === TOUR_STEPS.length - 1
      ? "Finish"
      : "Next"
    : setupIndex === SETUP_STEPS.length - 1
      ? "Start tour"
      : "Next";

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.safeArea}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              <View style={styles.topRow}>
                <Image
                  source={require("@/assets/images/expo-logo.png")}
                  style={styles.logo}
                  contentFit="contain"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting || isCompleting}
                  onPress={() => void complete()}
                  style={({ pressed }) => [
                    styles.skipButton,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                >
                  {isCompleting ? (
                    <ActivityIndicator
                      color={theme.textSecondary}
                      size="small"
                    />
                  ) : (
                    <Text
                      style={[styles.skipButtonText, { color: theme.text }]}
                    >
                      Skip
                    </Text>
                  )}
                </Pressable>
              </View>

              <View style={[styles.card, { backgroundColor: theme.tabBar }]}>
                {isTouring ? (
                  <TourContent step={tourStep} theme={theme} />
                ) : (
                  <>
                    <View
                      style={[
                        styles.stepIcon,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <SymbolView
                        name={setupStep.icon}
                        size={34}
                        tintColor={theme.primary}
                        weight="semibold"
                      />
                    </View>

                    <View style={styles.heading}>
                      <Text
                        style={[
                          styles.eyebrow,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {setupStep.eyebrow}
                      </Text>
                      <Text style={[styles.title, { color: theme.text }]}>
                        {setupStep.title}
                      </Text>
                      <Text
                        style={[
                          styles.subtitle,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {setupStep.subtitle}
                      </Text>
                    </View>

                    {setupStep.key === "create" ? (
                      <CreateFirstItemForm
                        activeOption={activeOption}
                        canCreate={canCreate}
                        createdItem={createdItem}
                        error={error}
                        firstItemKind={firstItemKind}
                        isDropdownOpen={isDropdownOpen}
                        isSubmitting={isSubmitting}
                        itemName={itemName}
                        onCreate={() => void createFirstItem()}
                        onNameChange={(text) => {
                          setError(null);
                          setItemName(text);
                        }}
                        onSelectKind={(kind) => {
                          setError(null);
                          setFirstItemKind(kind);
                          setIsDropdownOpen(false);
                        }}
                        onToggleDropdown={() =>
                          setIsDropdownOpen((current) => !current)
                        }
                        theme={theme}
                      />
                    ) : setupStep.key === "proof" ? (
                      <ProofStep
                        createdItem={createdItem}
                        isSubmitting={isSubmitting}
                        noteText={proofNote}
                        onNoteChange={(text) => {
                          setError(null);
                          setProofNote(text);
                          setProofNoteSaved(false);
                        }}
                        onSaveNote={() => void saveProofNote()}
                        onTakePhoto={(source) => void saveProofPhoto(source)}
                        proofCompleted={proofCompleted}
                        proofNoteSaved={proofNoteSaved}
                        theme={theme}
                      />
                    ) : (
                      <FriendsStep
                        contactQuery={contactQuery}
                        contactState={contactState}
                        contacts={filteredContacts}
                        hasContacts={contacts.length > 0}
                        inviteSent={inviteSent}
                        isCompleting={isCompleting}
                        isSubmitting={isSubmitting}
                        onInvite={(contact) => void inviteContact(contact)}
                        onLoadContacts={() => void loadContacts()}
                        onSearch={(text) => {
                          setError(null);
                          setContactQuery(text);
                        }}
                        theme={theme}
                      />
                    )}

                    {setupStep.key !== "create" && error ? (
                      <Text
                        style={[styles.errorText, { color: theme.primary }]}
                      >
                        {error}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                borderTopColor: theme.tabBorder,
                backgroundColor: theme.background,
              },
            ]}
          >
            <View style={styles.dots}>
              {(isTouring ? TOUR_STEPS : SETUP_STEPS).map((item, index) => (
                <View
                  key={item.key}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        index === (isTouring ? tourIndex : setupIndex)
                          ? theme.primary
                          : theme.backgroundElement,
                    },
                  ]}
                />
              ))}
            </View>

            <View style={styles.footerActions}>
              <Pressable
                accessibilityRole="button"
                disabled={
                  !canNavigate || (!isTouring && setupIndex === 0)
                }
                onPress={goBack}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  {
                    backgroundColor: theme.backgroundElement,
                    opacity: !isTouring && setupIndex === 0 ? 0.45 : 1,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[styles.secondaryButtonText, { color: theme.text }]}
                >
                  Back
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={!canUseNext || !canNavigate}
                onPress={goNext}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor:
                      canUseNext && canNavigate
                        ? theme.primary
                        : theme.backgroundSelected,
                  },
                  pressed && canUseNext && canNavigate && styles.pressed,
                ]}
              >
                {isCompleting ? (
                  <ActivityIndicator color={theme.primaryForeground} />
                ) : (
                  <Text
                    style={[
                      styles.primaryButtonText,
                      {
                        color:
                          canUseNext && canNavigate
                            ? theme.primaryForeground
                            : theme.textSecondary,
                      },
                    ]}
                  >
                    {primaryLabel}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function CreateFirstItemForm({
  activeOption,
  canCreate,
  createdItem,
  error,
  firstItemKind,
  isDropdownOpen,
  isSubmitting,
  itemName,
  onCreate,
  onNameChange,
  onSelectKind,
  onToggleDropdown,
  theme,
}: {
  activeOption: FirstItemOption;
  canCreate: boolean;
  createdItem: CreatedItem | null;
  error: string | null;
  firstItemKind: FirstItemKind;
  isDropdownOpen: boolean;
  isSubmitting: boolean;
  itemName: string;
  onCreate: () => void;
  onNameChange: (text: string) => void;
  onSelectKind: (kind: FirstItemKind) => void;
  onToggleDropdown: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.form}>
      <Text style={[styles.inputLabel, { color: theme.text }]}>
        What would you like to add first?
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onToggleDropdown}
        style={({ pressed }) => [
          styles.selectButton,
          { backgroundColor: theme.background, borderColor: theme.tabBorder },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.selectButtonLeft}>
          <SymbolView
            name={activeOption.icon}
            size={22}
            tintColor={theme.primary}
            weight="semibold"
          />
          <Text style={[styles.selectButtonText, { color: theme.text }]}>
            {activeOption.label}
          </Text>
        </View>
        <SymbolView
          name={sym("chevron.down", "keyboard_arrow_down")}
          size={22}
          tintColor={theme.textSecondary}
          weight="semibold"
        />
      </Pressable>

      {isDropdownOpen ? (
        <View
          style={[
            styles.dropdown,
            { backgroundColor: theme.background, borderColor: theme.tabBorder },
          ]}
        >
          {FIRST_ITEM_OPTIONS.map((option) => {
            const selected = firstItemKind === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelectKind(option.key)}
                style={({ pressed }) => [
                  styles.dropdownOption,
                  selected && { backgroundColor: `${theme.primary}22` },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={option.icon}
                  size={20}
                  tintColor={selected ? theme.primary : theme.textSecondary}
                  weight="semibold"
                />
                <Text
                  style={[
                    styles.dropdownOptionText,
                    { color: selected ? theme.primary : theme.text },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Text style={[styles.inputLabel, { color: theme.text }]}>Name</Text>
      <TextInput
        autoCapitalize="sentences"
        autoCorrect
        onChangeText={onNameChange}
        onSubmitEditing={onCreate}
        placeholder={activeOption.placeholder}
        placeholderTextColor={theme.textSecondary}
        returnKeyType="done"
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            borderColor: theme.tabBorder,
            color: theme.text,
          },
        ]}
        value={itemName}
      />
      <Pressable
        accessibilityRole="button"
        disabled={!canCreate}
        onPress={onCreate}
        style={({ pressed }) => [
          styles.actionButton,
          {
            backgroundColor: canCreate
              ? theme.primary
              : theme.backgroundSelected,
          },
          pressed && canCreate && styles.pressed,
        ]}
      >
        {isSubmitting ? (
          <ActivityIndicator color={theme.primaryForeground} />
        ) : (
          <Text
            style={[
              styles.actionButtonText,
              {
                color: canCreate
                  ? theme.primaryForeground
                  : theme.textSecondary,
              },
            ]}
          >
            {activeOption.actionLabel}
          </Text>
        )}
      </Pressable>

      {createdItem ? (
        <Text style={[styles.successText, { color: theme.primary }]}>
          {selectedOption(createdItem.kind).successLabel}
        </Text>
      ) : null}
      {error ? (
        <Text style={[styles.errorText, { color: theme.primary }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function ProofStep({
  createdItem,
  isSubmitting,
  noteText,
  onNoteChange,
  onSaveNote,
  onTakePhoto,
  proofCompleted,
  proofNoteSaved,
  theme,
}: {
  createdItem: CreatedItem | null;
  isSubmitting: boolean;
  noteText: string;
  onNoteChange: (text: string) => void;
  onSaveNote: () => void;
  onTakePhoto: (source: GoalPhotoSource) => void;
  proofCompleted: boolean;
  proofNoteSaved: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const canSaveNote = Boolean(createdItem && noteText.trim() && !isSubmitting);

  return (
    <View style={styles.form}>
      <View
        style={[
          styles.summaryBox,
          { backgroundColor: theme.background, borderColor: theme.tabBorder },
        ]}
      >
        <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
          Today
        </Text>
        <Text style={[styles.summaryTitle, { color: theme.text }]}>
          {createdItem?.title ?? "Add your first item before taking a photo"}
        </Text>
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
          {createdItem?.task
            ? "Take or choose a photo, then the task is marked complete."
            : "Take or choose a photo, then it is saved and today is marked complete."}
        </Text>
      </View>

      <View style={styles.photoActionRow}>
        <Pressable
          accessibilityRole="button"
          disabled={!createdItem || isSubmitting}
          onPress={() => onTakePhoto("camera")}
          style={({ pressed }) => [
            styles.actionButton,
            styles.photoActionButton,
            {
              backgroundColor:
                createdItem && !isSubmitting
                  ? theme.primary
                  : theme.backgroundSelected,
            },
            pressed && createdItem && !isSubmitting && styles.pressed,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.primaryForeground} />
          ) : (
            <>
              <SymbolView
                name={sym("camera.fill", "photo_camera")}
                size={20}
                tintColor={
                  createdItem ? theme.primaryForeground : theme.textSecondary
                }
                weight="semibold"
              />
              <Text
                style={[
                  styles.actionButtonText,
                  {
                    color: createdItem
                      ? theme.primaryForeground
                      : theme.textSecondary,
                  },
                ]}
              >
                Camera
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={!createdItem || isSubmitting}
          onPress={() => onTakePhoto("library")}
          style={({ pressed }) => [
            styles.secondaryActionButton,
            styles.photoActionButton,
            {
              backgroundColor: theme.background,
              borderColor: theme.tabBorder,
            },
            pressed && createdItem && !isSubmitting && styles.pressed,
          ]}
        >
          <SymbolView
            name={sym("photo.fill", "image")}
            size={20}
            tintColor={createdItem ? theme.primary : theme.textSecondary}
            weight="semibold"
          />
          <Text
            style={[
              styles.actionButtonText,
              { color: createdItem ? theme.primary : theme.textSecondary },
            ]}
          >
            Library
          </Text>
        </Pressable>
      </View>

      <View style={styles.noteSection}>
        <Text style={[styles.orText, { color: theme.textSecondary }]}>
          Or just add a note about your plan or experience.
        </Text>
        <TextInput
          editable={Boolean(createdItem && !isSubmitting)}
          multiline
          onChangeText={onNoteChange}
          placeholder="Write a quick note..."
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.noteInput,
            {
              backgroundColor: theme.background,
              borderColor: theme.tabBorder,
              color: theme.text,
            },
          ]}
          textAlignVertical="top"
          value={noteText}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!canSaveNote}
          onPress={onSaveNote}
          style={({ pressed }) => [
            styles.secondaryActionButton,
            {
              backgroundColor: canSaveNote
                ? theme.background
                : theme.backgroundSelected,
              borderColor: canSaveNote ? theme.primary : theme.tabBorder,
            },
            pressed && canSaveNote && styles.pressed,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <Text
              style={[
                styles.actionButtonText,
                { color: canSaveNote ? theme.primary : theme.textSecondary },
              ]}
            >
              Save note
            </Text>
          )}
        </Pressable>
      </View>

      {proofCompleted ? (
        <Text style={[styles.successText, { color: theme.primary }]}>
          {proofNoteSaved
            ? createdItem?.task
              ? "Task marked complete."
              : "Note saved and marked complete."
            : createdItem?.task
              ? "Task marked complete."
              : "Photo saved and marked complete."}
        </Text>
      ) : null}
    </View>
  );
}

function FriendsStep({
  contactQuery,
  contactState,
  contacts,
  hasContacts,
  inviteSent,
  isCompleting,
  isSubmitting,
  onInvite,
  onLoadContacts,
  onSearch,
  theme,
}: {
  contactQuery: string;
  contactState: "idle" | "loading" | "granted" | "denied";
  contacts: ContactInvite[];
  hasContacts: boolean;
  inviteSent: boolean;
  isCompleting: boolean;
  isSubmitting: boolean;
  onInvite: (contact: ContactInvite) => void;
  onLoadContacts: () => void;
  onSearch: (text: string) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.form}>
      <Pressable
        accessibilityRole="button"
        disabled={contactState === "loading" || isCompleting}
        onPress={onLoadContacts}
        style={({ pressed }) => [
          styles.actionButton,
          { backgroundColor: theme.primary },
          pressed && styles.pressed,
        ]}
      >
        {contactState === "loading" ? (
          <ActivityIndicator color={theme.primaryForeground} />
        ) : (
          <Text
            style={[
              styles.actionButtonText,
              { color: theme.primaryForeground },
            ]}
          >
            {hasContacts ? "Refresh contacts" : "Choose from contacts"}
          </Text>
        )}
      </Pressable>

      {hasContacts ? (
        <>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onSearch}
            placeholder="Search contacts"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            style={[
              styles.input,
              {
                backgroundColor: theme.background,
                borderColor: theme.tabBorder,
                color: theme.text,
              },
            ]}
            value={contactQuery}
          />
          <View style={styles.contactList}>
            {contacts.map((contact) => (
              <Pressable
                key={`${contact.id}-${contact.phoneNumber}`}
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={() => onInvite(contact)}
                style={({ pressed }) => [
                  styles.contactRow,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.tabBorder,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.contactText}>
                  <Text
                    numberOfLines={1}
                    style={[styles.contactName, { color: theme.text }]}
                  >
                    {contact.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.contactPhone,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {contact.phoneNumber}
                  </Text>
                </View>
                <SymbolView
                  name={sym("message.fill", "sms")}
                  size={21}
                  tintColor={theme.primary}
                  weight="semibold"
                />
              </Pressable>
            ))}
          </View>
        </>
      ) : contactState === "denied" ? (
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
          Contacts access is off. You can still finish setup and add friends
          later.
        </Text>
      ) : null}

      {inviteSent ? (
        <Text style={[styles.successText, { color: theme.primary }]}>
          Text invite opened.
        </Text>
      ) : null}
    </View>
  );
}

function TourContent({
  step,
  theme,
}: {
  step: TourStep;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <>
      <View style={styles.tourHeader}>
        <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>
          Quick tour
        </Text>
        <Text style={[styles.title, { color: theme.text }]}>{step.title}</Text>
      </View>

      <View style={styles.tourIcons}>
        {TOUR_STEPS.map((item) => {
          const selected = item.key === step.key;
          return (
            <View key={item.key} style={styles.tourIconWrap}>
              <View
                style={[
                  styles.tourIconButton,
                  {
                    backgroundColor: selected
                      ? theme.primary
                      : theme.backgroundElement,
                    borderColor: selected ? theme.primary : theme.tabBorder,
                    shadowColor: selected ? theme.primary : "transparent",
                  },
                  selected && styles.tourIconButtonActive,
                ]}
              >
                <SymbolView
                  name={item.icon}
                  size={24}
                  tintColor={
                    selected ? theme.primaryForeground : theme.textSecondary
                  }
                  weight="semibold"
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.tourIconLabel,
                  { color: selected ? theme.primary : theme.textSecondary },
                ]}
              >
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>

      <View
        style={[
          styles.tooltip,
          { backgroundColor: theme.background, borderColor: theme.primary },
        ]}
      >
        <View
          style={[styles.tooltipArrow, { backgroundColor: theme.primary }]}
        />
        <Text style={[styles.tooltipTitle, { color: theme.text }]}>
          {step.title}
        </Text>
        <Text style={[styles.tooltipDetail, { color: theme.textSecondary }]}>
          {step.detail}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 132,
    alignItems: "center",
  },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    gap: 22,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    width: 72,
    height: 72,
  },
  skipButton: {
    minWidth: 70,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  skipButtonText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
  },
  card: {
    borderRadius: 26,
    padding: 22,
    gap: 22,
  },
  stepIcon: {
    width: 74,
    height: 74,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    gap: 9,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
  },
  form: {
    gap: 12,
  },
  inputLabel: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
  },
  input: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 18,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
  },
  selectButton: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  selectButtonLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectButtonText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  dropdown: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 6,
    gap: 2,
  },
  dropdownOption: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dropdownOptionText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },
  actionButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 9,
  },
  secondaryActionButton: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 9,
  },
  photoActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  photoActionButton: {
    flex: 1,
  },
  actionButtonText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  noteSection: {
    gap: 10,
    paddingTop: 8,
  },
  orText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
  },
  noteInput: {
    minHeight: 104,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  summaryBox: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 7,
  },
  summaryLabel: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  summaryTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "900",
  },
  successText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  contactList: {
    gap: 10,
  },
  contactRow: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  contactText: {
    flex: 1,
    minWidth: 0,
  },
  contactName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  contactPhone: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
  },
  errorText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  tourHeader: {
    gap: 9,
  },
  tourIcons: {
    flexDirection: "row",
    gap: 8,
  },
  tourIconWrap: {
    flex: 1,
    alignItems: "center",
    gap: 7,
  },
  tourIconButton: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tourIconButtonActive: {
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    transform: [{ scale: 1.06 }],
  },
  tourIconLabel: {
    maxWidth: "100%",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  tooltip: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 8,
    position: "relative",
  },
  tooltipArrow: {
    width: 20,
    height: 20,
    borderRadius: 4,
    position: "absolute",
    top: -7,
    alignSelf: "center",
    transform: [{ rotate: "45deg" }],
  },
  tooltipTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
  },
  tooltipDetail: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 14,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerActions: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    flexDirection: "row",
    gap: 12,
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "900",
  },
  primaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.75,
  },
});
