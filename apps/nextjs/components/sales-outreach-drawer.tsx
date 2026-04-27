"use client";

import {
  EMPTY_SALES_CHECKLIST,
  SALES_CHANNEL_KEYS,
  type SalesActivityInput,
  type SalesActivityLog,
  type SalesChannelKey,
  type SalesChecklistState,
  toDateKey,
} from "@/lib/habit-state";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Tab,
  Tabs,
  Textarea,
  addToast,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Icon } from "@iconify/react";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { DrawerNotesCard } from "./drawer-notes-card";

const SALES_CHECKLIST_ITEMS = [
  { key: "coldEmails", label: "50 cold emails", icon: "mdi:email-multiple-outline" },
  { key: "linkedinMessages", label: "10 LinkedIn messages", icon: "mdi:linkedin" },
  { key: "prospectiveClients", label: "Contact 3 prospective clients", icon: "mdi:account-group-outline" },
  { key: "coldCallOrVisit", label: "1 cold call or visit", icon: "mdi:phone-outgoing-outline" },
  { key: "studyCoding", label: "Study coding while vibing", icon: "mdi:code-braces" },
  { key: "workForEY", label: "Work 3+ hours for EY", icon: "mdi:briefcase-outline" },
] as const satisfies ReadonlyArray<{ key: keyof SalesChecklistState; label: string; icon: string }>;

const SALES_CHANNEL_OPTIONS = [
  { key: "call", label: "Call", icon: "mdi:phone-outline" },
  { key: "email", label: "Email", icon: "mdi:email-outline" },
  { key: "dm", label: "DM", icon: "mdi:message-outline" },
  { key: "meeting", label: "Meeting", icon: "mdi:account-group-outline" },
] as const satisfies ReadonlyArray<{
  key: SalesChannelKey;
  label: string;
  icon: string;
}>;

const salesActivitySchema = z.object({
  leadName: z
    .string()
    .trim()
    .min(2, "Lead name must be at least 2 characters."),
  company: z.string().trim().min(2, "Company must be at least 2 characters."),
  channel: z.enum(SALES_CHANNEL_KEYS),
  amount: z.coerce.number().min(0, "Amount cannot be negative."),
  notes: z
    .string()
    .trim()
    .max(240, "Notes can be at most 240 characters.")
    .optional(),
});

type SalesActivityFormValues = z.infer<typeof salesActivitySchema>;

type SalesOutreachDrawerProps = {
  salesDrawerDate: Date | null;
  salesByDate: Record<string, SalesActivityLog[]>;
  checklistsByDate: Record<string, SalesChecklistState>;
  notes: string | null;
  onChecklistChange: (dateKey: string, nextChecklist: SalesChecklistState) => void;
  onSaveActivity: (dateKey: string, activity: SalesActivityInput) => Promise<void>;
  onNotesChange: (dateKey: string, nextNotes: string | null) => Promise<void> | void;
  onClose: () => void;
};

const SALES_REPORT_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5N/5sAAAAASUVORK5CYII=";

const salesReportStyles = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 28, paddingBottom: 36, fontSize: 11 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  logoWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 18, height: 18, borderRadius: 3 },
  title: { fontSize: 17, fontWeight: 700 },
  subtitle: { marginTop: 2, fontSize: 10, color: "#64748b" },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statCard: { flexGrow: 1, borderRadius: 6, borderWidth: 1, borderColor: "#e2e8f0", padding: 8 },
  statLabel: { color: "#64748b", fontSize: 9, marginBottom: 2 },
  statValue: { fontSize: 12, fontWeight: 700 },
  tableHead: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc", paddingVertical: 6, paddingHorizontal: 4, fontSize: 10, fontWeight: 700 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#f1f5f9", paddingVertical: 7, paddingHorizontal: 4 },
  colLead: { width: "30%" },
  colCompany: { width: "30%" },
  colChannel: { width: "20%" },
  colAmount: { width: "20%", textAlign: "right" },
});

const formatDayLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

const SalesReportPdfDocument = ({
  dateLabel,
  activities,
  totalAmount,
}: {
  dateLabel: string;
  activities: SalesActivityLog[];
  totalAmount: number;
}) => (
  <Document>
    <Page size="A4" style={salesReportStyles.page}>
      <View style={salesReportStyles.header}>
        <View style={salesReportStyles.logoWrap}>
          <Image src={SALES_REPORT_LOGO} style={salesReportStyles.logo} />
          <View>
            <Text style={salesReportStyles.title}>Sales / Outreach Report</Text>
            <Text style={salesReportStyles.subtitle}>{dateLabel}</Text>
          </View>
        </View>
      </View>
      <View style={salesReportStyles.statRow}>
        <View style={salesReportStyles.statCard}>
          <Text style={salesReportStyles.statLabel}>Activities</Text>
          <Text style={salesReportStyles.statValue}>{activities.length}</Text>
        </View>
        <View style={salesReportStyles.statCard}>
          <Text style={salesReportStyles.statLabel}>Pipeline Value</Text>
          <Text style={salesReportStyles.statValue}>${totalAmount.toLocaleString()}</Text>
        </View>
      </View>
      <View style={salesReportStyles.tableHead}>
        <Text style={salesReportStyles.colLead}>Lead</Text>
        <Text style={salesReportStyles.colCompany}>Company</Text>
        <Text style={salesReportStyles.colChannel}>Channel</Text>
        <Text style={salesReportStyles.colAmount}>Amount</Text>
      </View>
      {activities.map((activity) => (
        <View style={salesReportStyles.row} key={activity.id}>
          <Text style={salesReportStyles.colLead}>{activity.leadName}</Text>
          <Text style={salesReportStyles.colCompany}>{activity.company}</Text>
          <Text style={salesReportStyles.colChannel}>{activity.channel}</Text>
          <Text style={salesReportStyles.colAmount}>${activity.amount.toLocaleString()}</Text>
        </View>
      ))}
    </Page>
  </Document>
);

const cn = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

export const SalesOutreachDrawer = ({
  salesDrawerDate,
  salesByDate,
  checklistsByDate,
  notes,
  onChecklistChange,
  onSaveActivity,
  onNotesChange,
  onClose,
}: SalesOutreachDrawerProps) => {
  const formId = useId();
  const fontInitializedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<"checklist" | "log" | "summary">("checklist");

  const dateKey = useMemo(
    () => (salesDrawerDate ? toDateKey(salesDrawerDate) : ""),
    [salesDrawerDate],
  );

  const dayChecklist = useMemo(
    () => (dateKey ? (checklistsByDate[dateKey] ?? EMPTY_SALES_CHECKLIST) : EMPTY_SALES_CHECKLIST),
    [checklistsByDate, dateKey],
  );

  const completedCount = useMemo(
    () => Object.values(dayChecklist).filter(Boolean).length,
    [dayChecklist],
  );

  const daySales = useMemo(
    () => (dateKey ? (salesByDate[dateKey] ?? []) : []),
    [dateKey, salesByDate],
  );

  const totalAmount = useMemo(
    () => daySales.reduce((sum, activity) => sum + activity.amount, 0),
    [daySales],
  );

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
    setValue,
    watch,
  } = useForm<SalesActivityFormValues>({
    resolver: zodResolver(salesActivitySchema),
    defaultValues: { leadName: "", company: "", channel: "call", amount: 0, notes: "" },
  });

  const selectedChannel = watch("channel");

  useEffect(() => {
    if (fontInitializedRef.current) return;
    Font.registerHyphenationCallback((word) => [word]);
    fontInitializedRef.current = true;
  }, []);

  useEffect(() => {
    if (!salesDrawerDate) return;
    setActiveTab("checklist");
    reset({ leadName: "", company: "", channel: "call", amount: 0, notes: "" });
  }, [salesDrawerDate, reset]);

  const toggleItem = (itemKey: keyof SalesChecklistState) => {
    if (!dateKey) return;
    const current = checklistsByDate[dateKey] ?? EMPTY_SALES_CHECKLIST;
    onChecklistChange(dateKey, { ...current, [itemKey]: !current[itemKey] });
  };

  const resetChecklist = () => {
    if (!dateKey) return;
    onChecklistChange(dateKey, EMPTY_SALES_CHECKLIST);
    addToast({ title: "Checklist reset", description: "The sales checklist was cleared for this day.", color: "primary" });
  };

  const handleSave = useCallback(
    async (values: SalesActivityFormValues) => {
      if (!dateKey) return;
      try {
        await onSaveActivity(dateKey, { ...values, notes: values.notes?.trim() ?? "" });
        addToast({ title: "Saved", description: `Activity added for ${values.leadName}.`, color: "success" });
        reset({ leadName: "", company: "", channel: values.channel, amount: 0, notes: "" });
      } catch {
        addToast({ title: "Save failed", description: "We couldn't save that activity to the database.", color: "danger" });
      }
    },
    [dateKey, onSaveActivity, reset],
  );

  const handleExportPdf = useCallback(async () => {
    if (!salesDrawerDate) return;
    if (daySales.length === 0) {
      addToast({ title: "No activity to export", description: "Add at least one outreach activity first.", color: "warning" });
      return;
    }
    try {
      const label = formatDayLabel(salesDrawerDate);
      const blob = await pdf(
        <SalesReportPdfDocument dateLabel={label} activities={daySales} totalAmount={totalAmount} />,
      ).toBlob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `sales-report-${dateKey}.pdf`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      addToast({ title: "Export complete", description: `Saved report for ${label}.`, color: "primary" });
    } catch {
      addToast({ title: "Export failed", description: "Something went wrong while generating the PDF.", color: "danger" });
    }
  }, [dateKey, daySales, salesDrawerDate, totalAmount]);

  return (
    <Drawer
      isOpen={Boolean(salesDrawerDate)}
      onOpenChange={(open) => { if (!open) onClose(); }}
      placement="right"
      backdrop="blur"
      scrollBehavior="inside"
      classNames={{
        base: "m-0 h-dvh w-full max-w-full rounded-none border-l border-slate-200/80 bg-transparent sm:w-2/3 sm:max-w-[42rem]",
        backdrop: "bg-slate-950/45 backdrop-blur-[3px]",
        header: "p-0",
        body: "p-0",
        footer: "border-t border-slate-200/80 bg-white/88 px-4 py-4 backdrop-blur sm:px-6",
        closeButton: "right-4 top-4 z-20 rounded-full border border-white/70 bg-white/85 text-slate-700 shadow-sm transition hover:bg-white sm:right-5 sm:top-5",
      }}
    >
      <DrawerContent className="h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_24%),linear-gradient(180deg,#ffffff_0%,#fffaf2_48%,#ffffff_100%)] shadow-2xl">
        <DrawerHeader className="border-b border-slate-200/70 bg-white/85 px-4 py-5 backdrop-blur sm:px-6">
          <div className="pr-12">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-emerald-500 text-white shadow-lg shadow-amber-500/20">
                <Icon icon="mdi:currency-usd" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <Chip size="sm" variant="flat" className="border border-amber-200/80 bg-amber-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                  Sales tracker
                </Chip>
                <p className="mt-2 text-lg font-semibold text-slate-950">Sales / Outreach</p>
                <p className="text-sm text-slate-500">
                  {salesDrawerDate ? formatDayLabel(salesDrawerDate) : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-200/40">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Checklist</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">
                  {completedCount}/{SALES_CHECKLIST_ITEMS.length}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-200/40">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Activities</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{daySales.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-200/40">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">${totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody className="bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.08),transparent_34%)]">
          <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
            <DrawerNotesCard
              value={notes}
              onSave={(nextNotes) => onNotesChange(dateKey, nextNotes)}
              placeholder="Add context for the day, themes from outreach, or bigger-picture follow-up notes..."
            />

            <Tabs
              aria-label="Sales drawer sections"
              selectedKey={activeTab}
              onSelectionChange={(key) => setActiveTab(key as typeof activeTab)}
              className="w-full"
              classNames={{
                base: "w-full",
                tabList: "grid w-full grid-cols-3 rounded-2xl bg-slate-100/90 p-1",
                cursor: "rounded-xl bg-white shadow-sm",
                tab: "h-11",
                tabContent: "text-sm font-medium text-slate-500 group-data-[selected=true]:text-slate-950",
                panel: "px-0 pt-5",
              }}
            >
              <Tab key="checklist" title="Checklist">
                <Card shadow="none" className="border border-slate-200/80 bg-white/90">
                  <CardBody className="gap-3 p-3 sm:p-4">
                    {SALES_CHECKLIST_ITEMS.map((item) => {
                      const isComplete = dayChecklist[item.key];
                      return (
                        <button
                          type="button"
                          key={item.key}
                          onClick={() => toggleItem(item.key)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[22px] border p-4 text-left transition-all",
                            isComplete
                              ? "border-emerald-200 bg-emerald-50/80 shadow-sm"
                              : "border-slate-200/80 bg-slate-50/80 hover:border-amber-200 hover:bg-amber-50/50",
                          )}
                        >
                          <div className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                            isComplete
                              ? "border-emerald-200 bg-emerald-500 text-white"
                              : "border-slate-200 bg-white text-slate-500",
                          )}>
                            <Icon icon={isComplete ? "mdi:check-bold" : item.icon} className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900">{item.label}</p>
                            <p className="text-sm text-slate-500">
                              {isComplete ? "Completed for the day" : "Tap to mark complete"}
                            </p>
                          </div>
                          <Chip
                            size="sm"
                            variant="flat"
                            className={cn(
                              "shrink-0 border",
                              isComplete
                                ? "border-emerald-200 bg-white text-emerald-700"
                                : "border-slate-200 bg-white text-slate-600",
                            )}
                          >
                            {isComplete ? "Done" : "Pending"}
                          </Chip>
                        </button>
                      );
                    })}
                  </CardBody>
                </Card>
              </Tab>

              <Tab key="log" title="Log activity">
                <div className="space-y-4">
                  <Card shadow="none" className="border border-slate-200/80 bg-white/90">
                    <CardBody className="gap-4 p-4 sm:p-5">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">Add outreach activity</p>
                        <p className="text-sm text-slate-500">
                          Capture who you contacted, how you reached them, and the value tied to it.
                        </p>
                      </div>

                      <form id={formId} className="space-y-4" onSubmit={handleSubmit(handleSave)}>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Controller
                            name="leadName"
                            control={control}
                            render={({ field }) => (
                              <Input
                                label="Lead name"
                                labelPlacement="outside"
                                variant="bordered"
                                placeholder="Alex Johnson"
                                value={field.value}
                                onValueChange={field.onChange}
                                isInvalid={Boolean(errors.leadName)}
                                errorMessage={errors.leadName?.message}
                              />
                            )}
                          />
                          <Controller
                            name="company"
                            control={control}
                            render={({ field }) => (
                              <Input
                                label="Company"
                                labelPlacement="outside"
                                variant="bordered"
                                placeholder="Northwind"
                                value={field.value}
                                onValueChange={field.onChange}
                                isInvalid={Boolean(errors.company)}
                                errorMessage={errors.company?.message}
                              />
                            )}
                          />
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Channel</p>
                          <Tabs
                            size="sm"
                            selectedKey={selectedChannel}
                            onSelectionChange={(key) => {
                              setValue("channel", key as SalesActivityFormValues["channel"], {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                            }}
                            className="mt-3 w-full"
                            classNames={{
                              base: "w-full",
                              tabList: "grid w-full grid-cols-2 rounded-xl border border-slate-200 bg-white p-1 sm:grid-cols-4",
                              cursor: "rounded-lg bg-slate-950 shadow-sm",
                              tab: "h-10 px-2",
                              tabContent: "text-[12px] font-medium text-slate-500 group-data-[selected=true]:text-white",
                              panel: "hidden",
                            }}
                          >
                            {SALES_CHANNEL_OPTIONS.map((option) => (
                              <Tab
                                key={option.key}
                                title={
                                  <span className="inline-flex items-center gap-1.5">
                                    <Icon icon={option.icon} className="h-3.5 w-3.5" />
                                    {option.label}
                                  </span>
                                }
                              />
                            ))}
                          </Tabs>
                        </div>

                        <Controller
                          name="amount"
                          control={control}
                          render={({ field }) => (
                            <Input
                              label="Pipeline value"
                              labelPlacement="outside"
                              variant="bordered"
                              type="number"
                              min={0}
                              placeholder="0"
                              startContent={<span className="text-sm text-slate-400">$</span>}
                              value={String(field.value ?? 0)}
                              onValueChange={(value) => { field.onChange(value === "" ? 0 : Number(value)); }}
                              isInvalid={Boolean(errors.amount)}
                              errorMessage={errors.amount?.message}
                            />
                          )}
                        />

                        <Controller
                          name="notes"
                          control={control}
                          render={({ field }) => (
                            <Textarea
                              label="Notes"
                              labelPlacement="outside"
                              variant="bordered"
                              minRows={4}
                              placeholder="Summary, follow-up timing, objections..."
                              value={field.value ?? ""}
                              onValueChange={field.onChange}
                              isInvalid={Boolean(errors.notes)}
                              errorMessage={errors.notes?.message}
                            />
                          )}
                        />
                      </form>
                    </CardBody>
                  </Card>
                </div>
              </Tab>

              <Tab key="summary" title="Summary">
                <div className="space-y-4">
                  {daySales.length === 0 ? (
                    <Card shadow="none" className="border border-dashed border-slate-300 bg-white/80">
                      <CardBody className="items-center gap-3 px-6 py-10 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                          <Icon icon="mdi:chart-timeline-variant" className="h-7 w-7" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-lg font-semibold text-slate-900">Nothing logged yet</p>
                          <p className="text-sm text-slate-500">
                            Add your first outreach activity and the day summary will appear here.
                          </p>
                        </div>
                      </CardBody>
                    </Card>
                  ) : (
                    <Card shadow="none" className="border border-slate-200/80 bg-white/90">
                      <CardBody className="gap-3 p-3 sm:p-4">
                        {daySales.map((activity) => {
                          const channel = SALES_CHANNEL_OPTIONS.find((o) => o.key === activity.channel);
                          return (
                            <div key={activity.id} className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-slate-900">{activity.leadName}</p>
                                  <p className="text-xs text-slate-500">{activity.company}</p>
                                </div>
                                <Chip size="sm" variant="flat" className="shrink-0 border border-slate-200/80 bg-white capitalize text-slate-700">
                                  <span className="inline-flex items-center gap-1">
                                    <Icon icon={channel?.icon ?? "mdi:message-outline"} className="h-3 w-3" />
                                    {activity.channel}
                                  </span>
                                </Chip>
                              </div>
                              <div className="mt-3 flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-950">${activity.amount.toLocaleString()}</span>
                                <span className="text-slate-500">
                                  {new Date(activity.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                                </span>
                              </div>
                              {activity.notes ? (
                                <p className="mt-3 text-sm leading-6 text-slate-600">{activity.notes}</p>
                              ) : null}
                            </div>
                          );
                        })}
                      </CardBody>
                    </Card>
                  )}
                </div>
              </Tab>
            </Tabs>
          </div>
        </DrawerBody>

        <DrawerFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {activeTab === "checklist" ? (
            <Button variant="flat" onPress={resetChecklist} className="border border-slate-200 bg-white text-slate-700">
              Reset day
            </Button>
          ) : (
            <Button
              variant="flat"
              startContent={<Icon icon="mdi:file-pdf-box" className="h-4 w-4" />}
              onPress={handleExportPdf}
              className="border border-slate-200 bg-white text-slate-700"
            >
              Export PDF
            </Button>
          )}
          <Button variant="light" onPress={onClose} className="text-slate-600">
            Close
          </Button>
          {activeTab === "log" && (
            <Button
              color="primary"
              type="submit"
              form={formId}
              isLoading={isSubmitting}
              startContent={<Icon icon="mdi:content-save-outline" className="h-4 w-4" />}
              className="bg-slate-950 text-white shadow-lg shadow-slate-950/10"
            >
              Save activity
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
