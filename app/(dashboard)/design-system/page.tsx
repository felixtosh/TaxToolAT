"use client";

import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Filter,
  History,
  Link2,
  Loader2,
  Mail,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
  User,
  X,
  Building2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Info,
  Tag,
  Sparkles,
} from "lucide-react";

// UI Primitives
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Pill } from "@/components/ui/pill";
import { SearchButton } from "@/components/ui/search-button";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// Shared Primitives (Consolidated Patterns)
import {
  PanelHeader,
  PanelContainer,
  PanelContent,
  PanelFooter,
  FieldRow,
  SectionHeader as PanelSectionHeader,
  CollapsibleListSection,
  ListItem,
  EmptyState,
  SectionDivider,
  FileListItem,
} from "@/components/ui/detail-panel-primitives";
import {
  FilterButton,
  FilterOption,
  FilterOptionsGroup,
  FilterGroupDivider,
  FilterToolbar,
  FilterSeparator,
  ActiveFilterBadge,
  ClearFiltersButton,
} from "@/components/ui/filter-primitives";

// Navigation sections
const sections = [
  { id: "colors", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "buttons", label: "Buttons" },
  { id: "badges", label: "Badges & Pills" },
  { id: "forms", label: "Form Elements" },
  { id: "cards", label: "Cards & Panels" },
  { id: "tables", label: "Tables" },
  { id: "transactions", label: "Transactions" },
  { id: "sidebar", label: "Sidebar & Chat" },
  { id: "dialogs", label: "Dialogs & Sheets" },
  { id: "navigation", label: "Navigation" },
  { id: "toolbars", label: "Toolbars & Filters" },
  { id: "feedback", label: "Feedback & Status" },
  { id: "overlays", label: "Overlays & Popovers" },
  { id: "primitives", label: "Shared Primitives" },
];

// Color palette from globals.css
const colorPalette = [
  { name: "Background", var: "--color-background", value: "hsl(0 0% 100%)", className: "bg-background" },
  { name: "Foreground", var: "--color-foreground", value: "hsl(222.2 84% 4.9%)", className: "bg-foreground" },
  { name: "Card", var: "--color-card", value: "hsl(0 0% 100%)", className: "bg-card" },
  { name: "Primary", var: "--color-primary", value: "hsl(222.2 47.4% 11.2%)", className: "bg-primary" },
  { name: "Primary Foreground", var: "--color-primary-foreground", value: "hsl(210 40% 98%)", className: "bg-primary-foreground" },
  { name: "Secondary", var: "--color-secondary", value: "hsl(210 40% 96.1%)", className: "bg-secondary" },
  { name: "Muted", var: "--color-muted", value: "hsl(210 40% 96.1%)", className: "bg-muted" },
  { name: "Muted Foreground", var: "--color-muted-foreground", value: "hsl(215.4 16.3% 46.9%)", className: "bg-muted-foreground" },
  { name: "Accent", var: "--color-accent", value: "hsl(210 40% 96.1%)", className: "bg-accent" },
  { name: "Destructive", var: "--color-destructive", value: "hsl(0 84.2% 60.2%)", className: "bg-destructive" },
  { name: "Info", var: "--color-info", value: "hsl(45 93% 94%)", className: "bg-info" },
  { name: "Info Foreground", var: "--color-info-foreground", value: "hsl(32 81% 29%)", className: "bg-info-foreground" },
  { name: "Border", var: "--color-border", value: "hsl(214.3 31.8% 91.4%)", className: "bg-border" },
  { name: "Input", var: "--color-input", value: "hsl(214.3 31.8% 91.4%)", className: "bg-input" },
  { name: "Ring", var: "--color-ring", value: "hsl(222.2 84% 4.9%)", className: "bg-ring" },
];

function SectionHeader({ id, title }: { id: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-20">
      <h2 className="text-2xl font-semibold mb-4 pt-8 border-t">{title}</h2>
    </div>
  );
}

function ComponentGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function ComponentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-muted-foreground w-32 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

export default function DesignSystemPage() {
  const [activeSection, setActiveSection] = useState("colors");
  const [searchValue, setSearchValue] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [selectValue, setSelectValue] = useState("");
  const [tabValue, setTabValue] = useState("tab1");
  const [progress, setProgress] = useState(45);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Fixed Navigation Sidebar */}
        <nav className="w-56 border-r bg-muted/30 p-4 flex-shrink-0 overflow-y-auto">
          <h1 className="text-lg font-semibold mb-4">Design System</h1>
          <ul className="space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    activeSection === section.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main Content */}
        <ScrollArea className="flex-1">
          <div className="max-w-5xl mx-auto p-8 space-y-12">
            {/* ===== COLORS ===== */}
            <SectionHeader id="colors" title="Color Palette" />
            <p className="text-muted-foreground mb-6">
              All colors are defined as CSS variables using HSL values. This enables consistent theming and potential dark mode support.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {colorPalette.map((color) => (
                <div key={color.var} className="space-y-2">
                  <div
                    className={cn(
                      "h-16 rounded-lg border shadow-sm",
                      color.className
                    )}
                  />
                  <div>
                    <p className="text-sm font-medium">{color.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{color.var}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Semantic Colors */}
            <ComponentGroup title="Semantic Color Usage">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border bg-background">
                  <span className="text-foreground">Default text on background</span>
                </div>
                <div className="p-4 rounded-lg bg-primary text-primary-foreground">
                  Primary: Actions, CTAs
                </div>
                <div className="p-4 rounded-lg bg-secondary text-secondary-foreground">
                  Secondary: Alternative actions
                </div>
                <div className="p-4 rounded-lg bg-muted text-muted-foreground">
                  Muted: Subtle backgrounds, disabled
                </div>
                <div className="p-4 rounded-lg bg-destructive text-destructive-foreground">
                  Destructive: Errors, delete actions
                </div>
                <div className="p-4 rounded-lg bg-info text-info-foreground border border-info-border">
                  Info: Suggestions, notifications
                </div>
              </div>
            </ComponentGroup>

            {/* ===== TYPOGRAPHY ===== */}
            <SectionHeader id="typography" title="Typography" />
            <ComponentGroup title="Heading Hierarchy">
              <div className="space-y-4">
                <div className="text-4xl font-bold">Heading 1 - 36px Bold</div>
                <div className="text-3xl font-semibold">Heading 2 - 30px Semibold</div>
                <div className="text-2xl font-semibold">Heading 3 - 24px Semibold</div>
                <div className="text-xl font-medium">Heading 4 - 20px Medium</div>
                <div className="text-lg font-medium">Heading 5 - 18px Medium</div>
                <div className="text-base font-medium">Heading 6 - 16px Medium</div>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Body Text">
              <div className="space-y-4">
                <p className="text-base">Body (base) - 16px regular - The quick brown fox jumps over the lazy dog.</p>
                <p className="text-sm">Body small - 14px regular - The quick brown fox jumps over the lazy dog.</p>
                <p className="text-xs">Caption - 12px regular - The quick brown fox jumps over the lazy dog.</p>
                <p className="text-sm text-muted-foreground">Muted text - Used for secondary information</p>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Font Weights">
              <div className="space-y-2">
                <p className="font-normal">Normal (400) - Regular body text</p>
                <p className="font-medium">Medium (500) - Emphasis, labels</p>
                <p className="font-semibold">Semibold (600) - Headings, buttons</p>
                <p className="font-bold">Bold (700) - Strong emphasis</p>
              </div>
            </ComponentGroup>

            {/* ===== BUTTONS ===== */}
            <SectionHeader id="buttons" title="Buttons" />
            <ComponentGroup title="Button Variants">
              <ComponentRow label="Default">
                <Button>Default</Button>
                <Button disabled>Disabled</Button>
              </ComponentRow>
              <ComponentRow label="Secondary">
                <Button variant="secondary">Secondary</Button>
                <Button variant="secondary" disabled>Disabled</Button>
              </ComponentRow>
              <ComponentRow label="Outline">
                <Button variant="outline">Outline</Button>
                <Button variant="outline" disabled>Disabled</Button>
              </ComponentRow>
              <ComponentRow label="Ghost">
                <Button variant="ghost">Ghost</Button>
                <Button variant="ghost" disabled>Disabled</Button>
              </ComponentRow>
              <ComponentRow label="Destructive">
                <Button variant="destructive">Destructive</Button>
                <Button variant="destructive" disabled>Disabled</Button>
              </ComponentRow>
              <ComponentRow label="Link">
                <Button variant="link">Link Button</Button>
              </ComponentRow>
            </ComponentGroup>

            <ComponentGroup title="Button Sizes">
              <ComponentRow label="Sizes">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon"><Plus className="h-4 w-4" /></Button>
              </ComponentRow>
            </ComponentGroup>

            <ComponentGroup title="Buttons with Icons">
              <ComponentRow label="Icon Left">
                <Button><Plus className="mr-2 h-4 w-4" /> Add Item</Button>
                <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Upload</Button>
              </ComponentRow>
              <ComponentRow label="Icon Right">
                <Button>Continue <ChevronRight className="ml-2 h-4 w-4" /></Button>
              </ComponentRow>
              <ComponentRow label="Loading">
                <Button disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading</Button>
              </ComponentRow>
            </ComponentGroup>

            {/* ===== BADGES & PILLS ===== */}
            <SectionHeader id="badges" title="Badges & Pills" />
            <ComponentGroup title="Badge Variants">
              <ComponentRow label="Default">
                <Badge>Default</Badge>
                <Badge>New</Badge>
                <Badge>3</Badge>
              </ComponentRow>
              <ComponentRow label="Secondary">
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="secondary">Pending</Badge>
              </ComponentRow>
              <ComponentRow label="Outline">
                <Badge variant="outline">Outline</Badge>
                <Badge variant="outline">Draft</Badge>
              </ComponentRow>
              <ComponentRow label="Destructive">
                <Badge variant="destructive">Destructive</Badge>
                <Badge variant="destructive">Error</Badge>
              </ComponentRow>
            </ComponentGroup>

            <ComponentGroup title="Pills (Interactive Tags)">
              <ComponentRow label="Default">
                <Pill label="Category" />
                <Pill label="With Icon" icon={FileText} />
                <Pill label="Removable" onRemove={() => {}} />
              </ComponentRow>
              <ComponentRow label="Suggestion">
                <Pill label="Suggested match" variant="suggestion" />
                <Pill label="REWE" variant="suggestion" confidence={92} />
                <Pill label="Amazon" variant="suggestion" confidence={85} onClick={() => {}} />
              </ComponentRow>
              <ComponentRow label="Interactive">
                <Pill label="Click me" onClick={() => alert("Clicked!")} />
                <Pill label="Disabled" disabled />
              </ComponentRow>
            </ComponentGroup>

            {/* ===== FORM ELEMENTS ===== */}
            <SectionHeader id="forms" title="Form Elements" />
            <ComponentGroup title="Text Inputs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <div className="space-y-2">
                  <Label htmlFor="default-input">Default Input</Label>
                  <Input id="default-input" placeholder="Enter text..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="disabled-input">Disabled Input</Label>
                  <Input id="disabled-input" placeholder="Disabled" disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="with-icon">With Search Icon</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="with-icon" placeholder="Search..." className="pl-9" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="error-input" className="text-destructive">Error State</Label>
                  <Input id="error-input" placeholder="Invalid input" className="border-destructive" />
                </div>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Search Components">
              <ComponentRow label="Search Button">
                <SearchButton
                  value={searchValue}
                  onSearch={setSearchValue}
                  placeholder="Search transactions..."
                />
              </ComponentRow>
              <div className="max-w-sm">
                <ComponentRow label="Search Input">
                  <SearchInput
                    value={searchValue}
                    onChange={setSearchValue}
                    placeholder="Search partners..."
                  />
                </ComponentRow>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Select">
              <div className="max-w-xs">
                <Select value={selectValue} onValueChange={setSelectValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opt1">Option 1</SelectItem>
                    <SelectItem value="opt2">Option 2</SelectItem>
                    <SelectItem value="opt3">Option 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Checkbox">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="checkbox1"
                  checked={checkboxChecked}
                  onCheckedChange={(checked) => setCheckboxChecked(checked === true)}
                />
                <Label htmlFor="checkbox1">Accept terms and conditions</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="checkbox2" checked disabled />
                <Label htmlFor="checkbox2" className="text-muted-foreground">Disabled checked</Label>
              </div>
            </ComponentGroup>

            {/* ===== CARDS & PANELS ===== */}
            <SectionHeader id="cards" title="Cards & Panels" />
            <ComponentGroup title="Card Variants">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Card Title</CardTitle>
                    <CardDescription>Card description text goes here</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">Card content area with some example text.</p>
                  </CardContent>
                  <CardFooter>
                    <Button size="sm">Action</Button>
                  </CardFooter>
                </Card>

                <Card className="border-l-4 border-l-primary">
                  <CardHeader>
                    <CardTitle className="text-base">Accent Card</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Card with left accent border for emphasis.
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Muted Card</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">2,450</p>
                    <p className="text-xs text-muted-foreground">Total transactions</p>
                  </CardContent>
                </Card>

                <Card className="border-destructive/50 bg-destructive/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-destructive">Error Card</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">Something went wrong. Please try again.</p>
                  </CardContent>
                </Card>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Detail Panel Pattern">
              <div className="border rounded-lg max-w-md">
                <div className="flex items-center justify-between py-3 border-b px-4">
                  <h3 className="text-lg font-semibold">Panel Header</h3>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Field Label</p>
                    <p className="text-sm">Field Value</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Amount</p>
                    <p className="text-lg font-semibold text-red-600">-245.00</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Connected Files</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      <span>invoice_2024.pdf</span>
                    </div>
                  </div>
                </div>
                <div className="border-t px-4 py-2">
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                    <History className="h-4 w-4" />
                    <span>Edit History</span>
                  </Button>
                </div>
              </div>
            </ComponentGroup>

            {/* ===== TABLES ===== */}
            <SectionHeader id="tables" title="Tables" />
            <p className="text-muted-foreground mb-6">
              Table patterns based on the Transaction table - the primary data display in the application.
              Uses TanStack Table with virtualization for performance.
            </p>

            <ComponentGroup title="Sortable Headers">
              <p className="text-sm text-muted-foreground mb-3">
                Column headers with sort indicators. Based on <code className="text-xs bg-muted px-1 py-0.5 rounded">SortableHeader</code> component.
              </p>
              <div className="flex gap-4 flex-wrap">
                {/* Unsorted */}
                <Button variant="ghost" className="h-8 px-2 justify-between font-medium">
                  <span>Date</span>
                  <ArrowUpDown className="h-4 w-4 ml-2 text-muted-foreground/50" />
                </Button>
                {/* Sorted Ascending */}
                <Button variant="ghost" className="h-8 px-2 justify-between font-medium">
                  <span>Amount</span>
                  <ArrowUp className="h-4 w-4 ml-2" />
                </Button>
                {/* Sorted Descending */}
                <Button variant="ghost" className="h-8 px-2 justify-between font-medium">
                  <span>Name</span>
                  <ArrowDown className="h-4 w-4 ml-2" />
                </Button>
                {/* Automation Header (Partner/File columns) */}
                <div className="h-8 px-2 flex items-center justify-between font-medium border rounded">
                  <span>Partner</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 ml-2">
                          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View automations</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Transaction Table (Reference Pattern)">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[110px]">
                        <Button variant="ghost" className="h-8 -mx-2 px-2 w-full justify-between font-medium text-xs">
                          <span>Date</span>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </TableHead>
                      <TableHead className="w-[100px]">
                        <Button variant="ghost" className="h-8 -mx-2 px-2 w-full justify-between font-medium text-xs">
                          <span>Amount</span>
                          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </Button>
                      </TableHead>
                      <TableHead className="w-[220px]">Description</TableHead>
                      <TableHead className="w-[180px]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">Partner</span>
                          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </TableHead>
                      <TableHead className="w-[120px]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">File</span>
                          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </TableHead>
                      <TableHead className="w-[100px] text-xs font-medium">Account</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Completed row (green background) */}
                    <TableRow className="bg-green-50/70 hover:bg-green-100/70 dark:bg-green-950/20">
                      <TableCell>
                        <div>
                          <p className="text-sm whitespace-nowrap">Jan 15, 2024</p>
                          <p className="text-sm text-muted-foreground">14:30</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums text-red-600">-€125,50</span>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm truncate">Amazon</p>
                          <p className="text-sm text-muted-foreground truncate">Office Supplies Purchase</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Pill label="Amazon" icon={Building2} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">1</span>
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm truncate">Main Account</span>
                      </TableCell>
                    </TableRow>

                    {/* Row with partner suggestion */}
                    <TableRow className="hover:bg-muted/50">
                      <TableCell>
                        <p className="text-sm whitespace-nowrap">Jan 14, 2024</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums text-green-600">+€2.500,00</span>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm truncate">Client Corp</p>
                          <p className="text-sm text-muted-foreground truncate">Invoice Payment #2024-001</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Pill label="Client Corp" variant="suggestion" confidence={92} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">—</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm truncate">Main Account</span>
                      </TableCell>
                    </TableRow>

                    {/* Row with no-receipt category */}
                    <TableRow className="hover:bg-muted/50">
                      <TableCell>
                        <p className="text-sm whitespace-nowrap">Jan 13, 2024</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums text-red-600">-€12,50</span>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm truncate">Bank</p>
                          <p className="text-sm text-muted-foreground truncate">Account Fee</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">—</span>
                      </TableCell>
                      <TableCell>
                        <Pill label="Bank Fees" icon={Tag} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm truncate">Main Account</span>
                      </TableCell>
                    </TableRow>

                    {/* Selected row */}
                    <TableRow className="bg-muted/50 hover:bg-muted">
                      <TableCell>
                        <p className="text-sm whitespace-nowrap">Jan 12, 2024</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums text-red-600">-€15,99</span>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm truncate">Netflix</p>
                          <p className="text-sm text-muted-foreground truncate">Monthly Subscription</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Pill label="Netflix" icon={Building2} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">—</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm truncate">Main Account</span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Cell Patterns">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Date Cell */}
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2 uppercase">Date Cell</p>
                  <div>
                    <p className="text-sm whitespace-nowrap">Jan 15, 2024</p>
                    <p className="text-sm text-muted-foreground">14:30</p>
                  </div>
                </div>

                {/* Amount Cell - Negative */}
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2 uppercase">Amount (Expense)</p>
                  <span className="text-sm tabular-nums text-red-600">-€125,50</span>
                </div>

                {/* Amount Cell - Positive */}
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2 uppercase">Amount (Income)</p>
                  <span className="text-sm tabular-nums text-green-600">+€2.500,00</span>
                </div>

                {/* Description Cell */}
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2 uppercase">Description</p>
                  <div className="min-w-0">
                    <p className="text-sm truncate">Amazon</p>
                    <p className="text-sm text-muted-foreground truncate">Office Supplies Purchase</p>
                  </div>
                </div>

                {/* File Cell - With file */}
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2 uppercase">File (Connected)</p>
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">1</span>
                    <Check className="h-3 w-3 text-green-600" />
                  </div>
                </div>

                {/* File Cell - Empty */}
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2 uppercase">File (Empty)</p>
                  <span className="text-sm text-muted-foreground">—</span>
                </div>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Row States">
              <div className="space-y-2">
                <div className="p-3 border rounded flex items-center gap-4">
                  <span className="text-sm w-28 shrink-0">Default</span>
                  <div className="flex-1 h-12 border rounded bg-background flex items-center px-3 text-sm text-muted-foreground">hover:bg-muted/50</div>
                </div>
                <div className="p-3 border rounded flex items-center gap-4">
                  <span className="text-sm w-28 shrink-0">Selected</span>
                  <div className="flex-1 h-12 border rounded bg-muted/50 flex items-center px-3 text-sm">bg-muted/50</div>
                </div>
                <div className="p-3 border rounded flex items-center gap-4">
                  <span className="text-sm w-28 shrink-0">Completed</span>
                  <div className="flex-1 h-12 border rounded bg-green-50/70 dark:bg-green-950/20 flex items-center px-3 text-sm">bg-green-50/70</div>
                </div>
                <div className="p-3 border rounded flex items-center gap-4">
                  <span className="text-sm w-28 shrink-0">Highlight</span>
                  <div className="flex-1 h-12 border rounded bg-primary/10 animate-pulse flex items-center px-3 text-sm">animate-pulse bg-primary/10</div>
                </div>
              </div>
            </ComponentGroup>

            {/* ===== TRANSACTIONS (Priority Section) ===== */}
            <SectionHeader id="transactions" title="Transaction Patterns" />
            <p className="text-muted-foreground mb-6">
              Core patterns used in the Transaction overview and detail views. These are the most important UI patterns in the application.
            </p>

            <ComponentGroup title="Transaction Table Row">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead className="w-[100px]">Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead className="w-[100px]">Account</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Completed transaction (green background) */}
                    <TableRow className="bg-green-50/50">
                      <TableCell>
                        <div>
                          <p className="text-sm">Jan 15, 2024</p>
                          <p className="text-sm text-muted-foreground">14:30</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums text-red-600">-125.50</span>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm truncate">Amazon</p>
                          <p className="text-sm text-muted-foreground truncate">Office Supplies Purchase</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Pill label="Amazon" icon={Building2} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">1</span>
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm truncate">Main Account</span>
                      </TableCell>
                    </TableRow>
                    {/* Transaction with suggestion */}
                    <TableRow>
                      <TableCell>
                        <div>
                          <p className="text-sm">Jan 14, 2024</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums text-green-600">+2,500.00</span>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm truncate">Client Corp</p>
                          <p className="text-sm text-muted-foreground truncate">Invoice Payment #2024-001</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Pill label="Client Corp" variant="suggestion" confidence={92} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">-</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm truncate">Main Account</span>
                      </TableCell>
                    </TableRow>
                    {/* Selected transaction */}
                    <TableRow data-state="selected" className="bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="text-sm">Jan 13, 2024</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm tabular-nums text-red-600">-15.99</span>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="text-sm truncate">Netflix</p>
                          <p className="text-sm text-muted-foreground truncate">Monthly Subscription</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Pill label="Netflix" icon={Building2} />
                      </TableCell>
                      <TableCell>
                        <Pill label="Subscription" icon={FileText} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm truncate">Main Account</span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Transaction Detail Panel">
              <div className="border rounded-lg max-w-md">
                <PanelHeader
                  title="Transaction Details"
                  onClose={() => {}}
                  onNavigatePrevious={() => {}}
                  onNavigateNext={() => {}}
                  hasPrevious={true}
                  hasNext={true}
                />
                <div className="p-4 space-y-4">
                  {/* Amount display */}
                  <div className="text-center py-2">
                    <p className="text-3xl font-bold text-red-600">-125.50</p>
                    <p className="text-sm text-muted-foreground">EUR</p>
                  </div>

                  <Separator />

                  {/* Transaction details */}
                  <div className="space-y-1">
                    <FieldRow label="Date">Jan 15, 2024 14:30</FieldRow>
                    <FieldRow label="Description">Office Supplies Purchase</FieldRow>
                    <FieldRow label="Partner">
                      <Pill label="Amazon" icon={Building2} />
                    </FieldRow>
                    <FieldRow label="Account">Main Account (DE89...4321)</FieldRow>
                  </div>

                  <SectionDivider />

                  {/* Files section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <PanelSectionHeader>Connected Files</PanelSectionHeader>
                      <Button variant="outline" size="sm">
                        <Plus className="h-3 w-3 mr-1" />
                        Connect
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 p-2 border rounded hover:bg-muted/50 cursor-pointer">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">amazon_invoice_2024.pdf</p>
                          <p className="text-xs text-muted-foreground">Matched amount: 125.50</p>
                        </div>
                        <Check className="h-4 w-4 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>
                <PanelFooter>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                    <History className="h-4 w-4" />
                    <span>Edit History</span>
                  </Button>
                </PanelFooter>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Transaction Toolbar">
              <FilterToolbar>
                <SearchButton
                  value=""
                  onSearch={() => {}}
                  placeholder="Search transactions..."
                />

                <FilterButton
                  icon={<CalendarDays className="h-4 w-4" />}
                  label="Jan 1 - Mar 31"
                  isActive={true}
                  onClear={() => {}}
                >
                  <FilterOptionsGroup>
                    <FilterOption label="All time" onClick={() => {}} />
                    <FilterOption label="Last 30 days" onClick={() => {}} />
                    <FilterOption label="This year" isSelected onClick={() => {}} />
                    <FilterOption label="Last year" onClick={() => {}} />
                  </FilterOptionsGroup>
                </FilterButton>

                <FilterButton
                  icon={<FileText className="h-4 w-4" />}
                  label="No file"
                  isActive={true}
                  onClear={() => {}}
                >
                  <FilterOptionsGroup>
                    <FilterOption label="All" onClick={() => {}} />
                    <FilterOption label="Has file" onClick={() => {}} />
                    <FilterOption label="No file" isSelected onClick={() => {}} />
                  </FilterOptionsGroup>
                </FilterButton>

                <FilterButton
                  icon={<ArrowUpDown className="h-4 w-4" />}
                  label="Expenses"
                  isActive={true}
                  onClear={() => {}}
                >
                  <FilterOptionsGroup>
                    <FilterOption label="All" onClick={() => {}} />
                    <FilterOption label="Income" onClick={() => {}} />
                    <FilterOption label="Expenses" isSelected onClick={() => {}} />
                  </FilterOptionsGroup>
                </FilterButton>

                <FilterButton label="Partner">
                  <div className="space-y-2 p-1">
                    <SearchInput value="" onChange={() => {}} placeholder="Search partners..." />
                    <FilterOptionsGroup>
                      <FilterOption label="Amazon" onClick={() => {}} />
                      <FilterOption label="Netflix" onClick={() => {}} />
                      <FilterOption label="Client Corp" onClick={() => {}} />
                    </FilterOptionsGroup>
                  </div>
                </FilterButton>
              </FilterToolbar>
            </ComponentGroup>

            <ComponentGroup title="Connect File Overlay (Table-Overlay Dialog)">
              <p className="text-sm text-muted-foreground mb-4">
                This overlay appears when connecting a file to a transaction. It's a multi-tab dialog that slides over the detail panel.
              </p>
              <div className="border rounded-lg max-w-lg bg-background">
                {/* Overlay header */}
                <div className="flex items-center justify-between p-3 border-b">
                  <h4 className="font-medium">Connect File</h4>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Tabs */}
                <Tabs defaultValue="files" className="p-3">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="files" className="gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Files
                    </TabsTrigger>
                    <TabsTrigger value="email" className="gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </TabsTrigger>
                    <TabsTrigger value="web" className="gap-1.5">
                      <Link2 className="h-3.5 w-3.5" />
                      Web
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="files" className="mt-3 space-y-3">
                    {/* Search input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search files..." className="pl-9" />
                    </div>

                    {/* File list with suggestions */}
                    <div className="space-y-2">
                      {/* High confidence match */}
                      <div className="flex items-center gap-3 p-2 border rounded-lg hover:bg-muted/50 cursor-pointer border-green-200 bg-green-50/50">
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">amazon_invoice_jan15.pdf</p>
                          <p className="text-xs text-muted-foreground">Amount: €125.50 · Jan 15, 2024</p>
                        </div>
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">95%</Badge>
                      </div>

                      {/* Medium confidence match */}
                      <div className="flex items-center gap-3 p-2 border rounded-lg hover:bg-muted/50 cursor-pointer">
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">receipt_office_supplies.pdf</p>
                          <p className="text-xs text-muted-foreground">Amount: €127.00 · Jan 14, 2024</p>
                        </div>
                        <Badge variant="secondary">78%</Badge>
                      </div>

                      {/* No match indicator */}
                      <div className="flex items-center gap-3 p-2 border rounded-lg hover:bg-muted/50 cursor-pointer opacity-60">
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">random_document.pdf</p>
                          <p className="text-xs text-muted-foreground">No amount detected</p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="email" className="mt-3">
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Search email attachments</p>
                      <p className="text-xs mt-1">Connect Gmail to search invoices</p>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </ComponentGroup>

            {/* ===== SIDEBAR & CHAT ===== */}
            <SectionHeader id="sidebar" title="Sidebar & Chat" />
            <p className="text-muted-foreground mb-6">
              Resizable AI chat sidebar patterns used for assistant interactions.
            </p>

            <ComponentGroup title="Chat Sidebar Layout">
              <div className="border rounded-lg flex h-96 max-w-2xl overflow-hidden">
                {/* Sidebar */}
                <div className="w-72 border-r flex flex-col bg-background">
                  {/* Header */}
                  <div className="p-3 border-b flex items-center justify-between">
                    <Tabs defaultValue="messages" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="messages">Messages</TabsTrigger>
                        <TabsTrigger value="notifications">
                          Notifications
                          <Badge variant="destructive" className="ml-1.5 h-5 w-5 p-0 text-xs">3</Badge>
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Messages area */}
                  <ScrollArea className="flex-1 p-3">
                    <div className="space-y-3">
                      {/* User message */}
                      <div className="flex justify-end">
                        <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 max-w-[80%]">
                          <p className="text-sm">Find transactions without receipts</p>
                        </div>
                      </div>
                      {/* AI message */}
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-lg px-3 py-2 max-w-[80%]">
                          <p className="text-sm">I found 15 transactions without receipts. Would you like me to search for matching files?</p>
                        </div>
                      </div>
                      {/* Confirmation card */}
                      <div className="bg-info border border-info-border rounded-lg p-3">
                        <p className="text-sm font-medium text-info-foreground mb-2">Confirm action</p>
                        <p className="text-xs text-info-foreground/80 mb-3">Search for matching files for 15 transactions?</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1">Cancel</Button>
                          <Button size="sm" className="flex-1">Confirm</Button>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>

                  {/* Input area */}
                  <div className="p-3 border-t">
                    <div className="flex gap-2">
                      <Input placeholder="Ask anything..." className="flex-1" />
                      <Button size="icon">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Main content preview */}
                <div className="flex-1 bg-muted/30 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Main content area</p>
                </div>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Sidebar Resize Handle">
              <div className="flex items-center gap-4">
                <div className="w-1 h-20 bg-border hover:bg-primary cursor-col-resize rounded-full transition-colors" />
                <div className="text-sm text-muted-foreground">
                  <p>Drag to resize sidebar (280px - 600px)</p>
                  <p className="text-xs mt-1">Width persists across sessions</p>
                </div>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Chat Message Bubbles">
              <div className="space-y-3 max-w-md">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 max-w-[80%]">
                    <p className="text-sm">User message (right-aligned, primary color)</p>
                  </div>
                </div>
                {/* AI message */}
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 max-w-[80%]">
                    <p className="text-sm">AI response (left-aligned, muted background)</p>
                  </div>
                </div>
                {/* AI message with loading */}
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Notification Card">
              <div className="max-w-sm space-y-3">
                <div className="border rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <div className="bg-green-100 rounded-full p-1.5">
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Files matched</p>
                      <p className="text-xs text-muted-foreground">3 files matched to transactions automatically</p>
                    </div>
                    <span className="text-xs text-muted-foreground">2m ago</span>
                  </div>
                </div>
                <div className="border rounded-lg p-3 border-l-4 border-l-info">
                  <div className="flex items-start gap-3">
                    <div className="bg-info rounded-full p-1.5">
                      <Info className="h-4 w-4 text-info-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">New suggestion</p>
                      <p className="text-xs text-muted-foreground">Partner suggestion for transaction #1234</p>
                    </div>
                    <span className="text-xs text-muted-foreground">5m ago</span>
                  </div>
                </div>
              </div>
            </ComponentGroup>

            {/* ===== DIALOGS & SHEETS ===== */}
            <SectionHeader id="dialogs" title="Dialogs & Sheets" />
            <ComponentGroup title="Modal Dialog">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>Open Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Dialog Title</DialogTitle>
                    <DialogDescription>
                      This is a modal dialog used for confirmations, forms, or important information.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Input placeholder="Enter something..." />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </ComponentGroup>

            <ComponentGroup title="Side Sheet">
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline">Open Sheet</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Sheet Title</SheetTitle>
                    <SheetDescription>
                      Side sheets slide in from the edge and are used for detail panels, forms, or navigation.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-6 space-y-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Field Name</Label>
                      <p className="text-sm">Field value here</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Another Field</Label>
                      <p className="text-sm">Another value</p>
                    </div>
                    <Separator />
                    <Button className="w-full">Take Action</Button>
                  </div>
                </SheetContent>
              </Sheet>
            </ComponentGroup>

            <ComponentGroup title="Table Overlay Dialog Pattern">
              <div className="border rounded-lg p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground mb-4">
                  Used when selecting items from a table within a transaction context:
                </p>
                <div className="border rounded-lg bg-background">
                  <div className="flex items-center justify-between p-3 border-b">
                    <h4 className="font-medium">Connect File</h4>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Tabs defaultValue="files" className="p-3">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="files">Files</TabsTrigger>
                      <TabsTrigger value="email">Email</TabsTrigger>
                      <TabsTrigger value="gmail">Gmail</TabsTrigger>
                    </TabsList>
                    <TabsContent value="files" className="mt-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-2 border rounded hover:bg-muted cursor-pointer">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm flex-1">invoice_001.pdf</span>
                          <Badge variant="secondary">92%</Badge>
                        </div>
                        <div className="flex items-center gap-3 p-2 border rounded hover:bg-muted cursor-pointer">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm flex-1">receipt_amazon.pdf</span>
                          <Badge variant="secondary">78%</Badge>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </ComponentGroup>

            {/* ===== NAVIGATION ===== */}
            <SectionHeader id="navigation" title="Navigation" />
            <ComponentGroup title="Tabs">
              <Tabs value={tabValue} onValueChange={setTabValue}>
                <TabsList>
                  <TabsTrigger value="tab1">Overview</TabsTrigger>
                  <TabsTrigger value="tab2">Details</TabsTrigger>
                  <TabsTrigger value="tab3">History</TabsTrigger>
                </TabsList>
                <TabsContent value="tab1" className="p-4 border rounded-lg mt-2">
                  Overview content goes here
                </TabsContent>
                <TabsContent value="tab2" className="p-4 border rounded-lg mt-2">
                  Details content goes here
                </TabsContent>
                <TabsContent value="tab3" className="p-4 border rounded-lg mt-2">
                  History content goes here
                </TabsContent>
              </Tabs>
            </ComponentGroup>

            <ComponentGroup title="Dropdown Menu">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Menu className="mr-2 h-4 w-4" />
                    Menu
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked>
                    Show completed
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ComponentGroup>

            {/* ===== TOOLBARS & FILTERS ===== */}
            <SectionHeader id="toolbars" title="Toolbars & Filters" />
            <ComponentGroup title="Standard Toolbar Pattern">
              <div className="flex items-center gap-2 p-2 border rounded-lg bg-background flex-wrap">
                <SearchButton
                  value=""
                  onSearch={() => {}}
                  placeholder="Search..."
                />

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>Date</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="start">
                    <div className="space-y-2">
                      <Button variant="outline" size="sm" className="w-full justify-start">All time</Button>
                      <Button variant="outline" size="sm" className="w-full justify-start">Last 30 days</Button>
                      <Button variant="outline" size="sm" className="w-full justify-start">This year</Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2">
                      <FileText className="h-4 w-4" />
                      <span>File</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" size="sm" className="justify-start">All</Button>
                      <Button variant="ghost" size="sm" className="justify-start">Has file</Button>
                      <Button variant="ghost" size="sm" className="justify-start">No file</Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      <span>Type</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" size="sm" className="justify-start">All</Button>
                      <Button variant="ghost" size="sm" className="justify-start">Income</Button>
                      <Button variant="ghost" size="sm" className="justify-start">Expenses</Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="flex-1" />

                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add New
                </Button>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Active Filter Badges">
              <div className="flex items-center gap-2 p-2 border rounded-lg bg-background flex-wrap">
                <Button variant="secondary" size="sm" className="h-9 gap-2">
                  <CalendarDays className="h-4 w-4" />
                  <span>Jan 1 - Mar 31</span>
                  <X className="h-3 w-3 ml-1" />
                </Button>
                <Badge variant="secondary" className="gap-1 h-8">
                  Has file
                  <X className="h-3 w-3 cursor-pointer" />
                </Badge>
                <Badge variant="secondary" className="gap-1 h-8">
                  Partner: Amazon
                  <X className="h-3 w-3 cursor-pointer" />
                </Badge>
                <div className="h-4 w-px bg-border" />
                <Button variant="ghost" size="sm">Clear all</Button>
              </div>
            </ComponentGroup>

            {/* ===== FEEDBACK & STATUS ===== */}
            <SectionHeader id="feedback" title="Feedback & Status" />
            <ComponentGroup title="Alerts">
              <div className="space-y-4 max-w-xl">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Information</AlertTitle>
                  <AlertDescription>
                    This is an informational alert for general messages.
                  </AlertDescription>
                </Alert>
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    Something went wrong. Please try again later.
                  </AlertDescription>
                </Alert>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Progress">
              <div className="space-y-4 max-w-sm">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm">Upload progress</span>
                    <span className="text-sm text-muted-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Loading States">
              <ComponentRow label="Spinner">
                <Loader2 className="h-4 w-4 animate-spin" />
                <Loader2 className="h-6 w-6 animate-spin" />
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </ComponentRow>
              <ComponentRow label="Skeleton">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[160px]" />
                </div>
              </ComponentRow>
            </ComponentGroup>

            <ComponentGroup title="Empty States">
              <div className="border rounded-lg p-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No files found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload files or connect your email to get started.
                </p>
                <Button>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Files
                </Button>
              </div>
            </ComponentGroup>

            {/* ===== OVERLAYS & POPOVERS ===== */}
            <SectionHeader id="overlays" title="Overlays & Popovers" />
            <ComponentGroup title="Tooltips">
              <div className="flex gap-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline">Hover me</Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>This is a tooltip</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Info className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>More information about this feature</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Popovers">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">Open Popover</Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-4">
                    <h4 className="font-medium">Popover Content</h4>
                    <p className="text-sm text-muted-foreground">
                      Popovers are used for filters, settings panels, and other contextual content.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1">Cancel</Button>
                      <Button size="sm" className="flex-1">Apply</Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </ComponentGroup>

            <ComponentGroup title="Drag & Drop Zone">
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                <p className="font-medium">Drop files here or click to upload</p>
                <p className="text-sm text-muted-foreground">PDF, JPG, PNG up to 10MB</p>
              </div>
            </ComponentGroup>

            <ComponentGroup title="Upload Overlay (Active State)">
              <div className="border-2 border-dashed border-primary rounded-lg p-8 text-center bg-primary/10">
                <Upload className="h-12 w-12 mx-auto text-primary mb-4" />
                <p className="text-lg font-medium">Drop file to upload</p>
                <p className="text-sm text-muted-foreground">PDF, JPG, PNG, or WebP up to 10MB</p>
              </div>
            </ComponentGroup>

            {/* ===== SHARED PRIMITIVES ===== */}
            <SectionHeader id="primitives" title="Shared Primitives" />
            <p className="text-muted-foreground mb-6">
              Consolidated, reusable components extracted from common patterns across the codebase.
              These primitives reduce code duplication and ensure consistent styling.
            </p>

            <ComponentGroup title="Detail Panel Primitives">
              <div className="border rounded-lg max-w-md">
                <PanelHeader
                  title="Panel Header"
                  onClose={() => {}}
                  onNavigatePrevious={() => {}}
                  onNavigateNext={() => {}}
                  hasPrevious={true}
                  hasNext={true}
                />
                <div className="p-4 space-y-4">
                  <PanelSectionHeader>Section Header</PanelSectionHeader>
                  <FieldRow label="Name" icon={<User className="h-3 w-3" />}>
                    John Doe
                  </FieldRow>
                  <FieldRow label="Email">john@example.com</FieldRow>
                  <FieldRow label="Status">
                    <Badge variant="secondary">Active</Badge>
                  </FieldRow>
                  <SectionDivider />
                  <CollapsibleListSection
                    title="Transactions"
                    icon={<FileText className="h-4 w-4" />}
                    count={3}
                    defaultOpen={true}
                  >
                    <ListItem
                      title="Invoice Payment"
                      subtitle="Jan 15, 2024"
                      amount={25000}
                      isNegative={false}
                    />
                    <ListItem
                      title="Subscription"
                      subtitle="Jan 14, 2024"
                      amount={1599}
                      isNegative={true}
                    />
                    <ListItem
                      title="Office Supplies"
                      subtitle="Jan 13, 2024"
                      amount={12550}
                      isNegative={true}
                    />
                  </CollapsibleListSection>
                </div>
                <PanelFooter>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                    <History className="h-4 w-4" />
                    <span>Edit History</span>
                  </Button>
                </PanelFooter>
              </div>
            </ComponentGroup>

            <ComponentGroup title="File List Item Primitive">
              <div className="border rounded-lg p-4 max-w-md space-y-2">
                <PanelSectionHeader>Connected Files</PanelSectionHeader>
                <FileListItem
                  href="/files/123"
                  fileName="Invoice_2024_001.pdf"
                  date="Jan 15, 2024"
                  amount={12500}
                  onRemove={() => {}}
                />
                <FileListItem
                  href="/files/124"
                  fileName="Receipt_Amazon_Order_12345678901234.pdf"
                  date="Jan 14, 2024"
                  amount={4999}
                  onRemove={() => {}}
                />
                <FileListItem
                  fileName="Processing_document.pdf"
                  date="Jan 13, 2024"
                  isExtracting={true}
                  onRemove={() => {}}
                />
                <FileListItem
                  fileName="Removing_this_file.pdf"
                  date="Jan 12, 2024"
                  amount={999}
                  isRemoving={true}
                  onRemove={() => {}}
                />
              </div>
            </ComponentGroup>

            <ComponentGroup title="Filter Primitives">
              <FilterToolbar>
                <SearchButton
                  value=""
                  onSearch={() => {}}
                  placeholder="Search..."
                />

                <FilterButton
                  icon={<CalendarDays className="h-4 w-4" />}
                  label="Date"
                >
                  <FilterOptionsGroup>
                    <FilterOption label="All time" isSelected onClick={() => {}} />
                    <FilterOption label="Last 30 days" onClick={() => {}} />
                    <FilterOption label="This year" onClick={() => {}} />
                    <FilterOption label="Last year" onClick={() => {}} />
                  </FilterOptionsGroup>
                </FilterButton>

                <FilterButton
                  icon={<FileText className="h-4 w-4" />}
                  label="Has file"
                  isActive={true}
                  onClear={() => {}}
                >
                  <FilterOptionsGroup>
                    <FilterOption label="All" onClick={() => {}} />
                    <FilterOption label="Has file" isSelected onClick={() => {}} />
                    <FilterOption label="No file" onClick={() => {}} />
                  </FilterOptionsGroup>
                </FilterButton>

                <FilterButton
                  icon={<ArrowUpDown className="h-4 w-4" />}
                  label="Type"
                >
                  <FilterOptionsGroup>
                    <FilterOption label="All" isSelected onClick={() => {}} />
                    <FilterGroupDivider />
                    <FilterOption label="Income" onClick={() => {}} />
                    <FilterOption label="Expenses" onClick={() => {}} />
                  </FilterOptionsGroup>
                </FilterButton>

                <FilterSeparator />

                <ActiveFilterBadge label="Has file" onClear={() => {}} />

                <div className="flex-1" />

                <ClearFiltersButton onClick={() => {}} />
              </FilterToolbar>
            </ComponentGroup>

            <ComponentGroup title="Empty State Primitive">
              <div className="border rounded-lg">
                <EmptyState
                  icon={<FileText className="h-12 w-12" />}
                  title="No files found"
                  description="Upload files or connect your email to get started."
                  action={
                    <Button>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Files
                    </Button>
                  }
                />
              </div>
            </ComponentGroup>

            <ComponentGroup title="Usage Guidelines">
              <div className="prose prose-sm max-w-none">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>When to use these primitives</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 mt-2 space-y-1 text-sm">
                      <li><strong>PanelHeader</strong>: All detail panels (Transaction, File, Partner, Category)</li>
                      <li><strong>FieldRow</strong>: Displaying label-value pairs in panels</li>
                      <li><strong>CollapsibleListSection</strong>: Lists of related items (files, transactions)</li>
                      <li><strong>ListItem</strong>: Clickable items in lists with amount display</li>
                      <li><strong>FileListItem</strong>: File displays with name, date, amount, and remove action</li>
                      <li><strong>FilterButton</strong>: Toolbar filter dropdowns with popover</li>
                      <li><strong>ActiveFilterBadge</strong>: Showing applied filters with clear option</li>
                      <li><strong>EmptyState</strong>: When no data is available</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            </ComponentGroup>

            {/* Spacer at bottom */}
            <div className="h-20" />
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
