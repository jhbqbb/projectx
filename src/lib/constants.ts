import {
  Activity,
  BarChart3,
  Blocks,
  CalendarDays,
  CandlestickChart,
  ChartNoAxesCombined,
  Compass,
  Database,
  Gauge,
  LayoutDashboard,
  LineChart,
  MessagesSquare,
  Repeat2,
  RotateCcw,
  Save,
  Settings,
  SplitSquareVertical,
  TrendingUp
} from "lucide-react";

export const NY_TIME_ZONE = "America/New_York";

export const SESSION_WINDOWS = {
  context: {
    label: "Premarket Context",
    start: "04:00",
    end: "09:25",
    timezone: NY_TIME_ZONE
  },
  newYork: {
    label: "Regular Session",
    start: "09:30",
    end: "16:00",
    timezone: NY_TIME_ZONE
  }
} as const;

export const REPORT_MODULES = [
  {
    id: "context-vs-regular",
    enum: "CONTEXT_VS_REGULAR",
    title: "Context vs Regular Session",
    icon: SplitSquareVertical,
    accent: "text-cyan-300"
  },
  {
    id: "gap-analysis",
    enum: "GAP_ANALYSIS",
    title: "Gap Analysis",
    icon: ChartNoAxesCombined,
    accent: "text-amber-300"
  },
  {
    id: "day-of-week",
    enum: "DAY_OF_WEEK",
    title: "Day Of Week",
    icon: CalendarDays,
    accent: "text-emerald-300"
  },
  {
    id: "session-continuation",
    enum: "SESSION_CONTINUATION",
    title: "Session Continuation",
    icon: Repeat2,
    accent: "text-sky-300"
  },
  {
    id: "session-reversal",
    enum: "SESSION_REVERSAL",
    title: "Session Reversal",
    icon: RotateCcw,
    accent: "text-rose-300"
  },
  {
    id: "range-expansion",
    enum: "RANGE_EXPANSION",
    title: "Range Expansion",
    icon: Gauge,
    accent: "text-violet-300"
  },
  {
    id: "high-low-breaks",
    enum: "HIGH_LOW_BREAKS",
    title: "High/Low Breaks",
    icon: Compass,
    accent: "text-lime-300"
  },
  {
    id: "opening-drive",
    enum: "OPENING_DRIVE",
    title: "Opening Drive",
    icon: TrendingUp,
    accent: "text-orange-300"
  },
  {
    id: "opening-range",
    enum: "OPENING_RANGE",
    title: "Opening Range",
    icon: CandlestickChart,
    accent: "text-fuchsia-300"
  }
] as const;

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai-research", label: "AI Research", icon: MessagesSquare },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/pattern-explorer", label: "Pattern Explorer", icon: Blocks },
  { href: "/session-analyzer", label: "Session Analyzer", icon: Activity },
  { href: "/saved-studies", label: "Saved Studies", icon: Save },
  { href: "/settings", label: "Settings", icon: Settings }
] as const;

export const DATASET_SOURCES = [
  { id: "alpha-vantage", label: "Alpha Vantage", icon: Database },
  { id: "csv-upload", label: "CSV Upload", icon: LineChart }
] as const;
