export type MondayCrmBoardKey =
  | "job-schedule"
  | "sales-activities"
  | "quotes"
  | "operator-accounts"
  | "contacts"
  | "rigs"
  | "stacked-rigs"
  | "customer-service";

export type MondayCrmBoardGroup = {
  name: string;
  records: number;
};

export type MondayCrmBoard = {
  key: MondayCrmBoardKey;
  title: string;
  sourceFile: string;
  purpose: string;
  records: number;
  columns: string[];
  groups: MondayCrmBoardGroup[];
};

export type MondayAutomationBoard = {
  sourceFile: string;
  rules: number;
  active: number;
  errors: number;
  example: string;
};

export const mondayCrmBoards: MondayCrmBoard[] = [
  {
    key: "job-schedule",
    title: "Job Schedule",
    sourceFile: "Job_Schedule.csv",
    purpose: "Live job pipeline",
    records: 2079,
    columns: [
      "Name",
      "Contacts",
      "Operator",
      "Rig",
      "Job Date/Time",
      "State",
      "County",
      "Salesperson",
      "Service Line",
      "Status",
      "Job Type",
      "Equipment Needed",
      "Size",
      "Connection",
      "Quoted Y/N",
      "Job Description",
      "Lead",
      "Directions",
      "Pre Job Checklist",
      "Invoice",
      "Pre Job Notes",
      "Signed Invoice",
      "Field Ticket",
      "Report",
      "Date Requested",
      "Status 2",
      "Item ID (auto generated)",
    ],
    groups: [
      { name: "Requested", records: 3 },
      { name: "Scheduled", records: 26 },
      { name: "In Progress", records: 20 },
      { name: "Completed Pending Invoice/Report", records: 37 },
      { name: "Waiting on Signature", records: 92 },
      { name: "Completed", records: 1869 },
      { name: "Cancelled", records: 32 },
    ],
  },
  {
    key: "sales-activities",
    title: "Sales Activities",
    sourceFile: "Sales_Activities_1784676345.xlsx",
    purpose: "Rig visits, calls, notes, and sales touches",
    records: 5297,
    columns: [
      "Name",
      "Related item",
      "Operators",
      "Rig/Contractor",
      "Activity Type",
      "Status",
      "Sales Rep",
      "Visit Date",
      "Activity",
      "Auto number",
      "Item ID (auto generated)",
    ],
    groups: [{ name: "Sales Activities", records: 5297 }],
  },
  {
    key: "quotes",
    title: "Quotes",
    sourceFile: "Quotes_1784676295.xlsx",
    purpose: "Requested, sent, approved, won, and lost quotes",
    records: 196,
    columns: [
      "Name",
      "Contacts",
      "Operator",
      "Rig",
      "Salesperson",
      "Status",
      "Equipment Needed",
      "Job Type",
      "Quote Number",
      "Quote",
      "Job Description",
      "Won/Lost",
      "Reason For Losses",
      "Date Requested",
      "Item ID (auto generated)",
    ],
    groups: [
      { name: "Approved", records: 3 },
      { name: "Sent", records: 193 },
    ],
  },
  {
    key: "operator-accounts",
    title: "Operator Accounts",
    sourceFile: "Operator_Accounts_1784676413.xlsx",
    purpose: "Company accounts and related rigs/contacts",
    records: 202,
    columns: [
      "Name",
      "Domain",
      "Headquarters location",
      "Contacts",
      "Contacts 2",
      "Rigs",
      "monday Doc v2",
      "Item ID (auto generated)",
    ],
    groups: [
      { name: "Operators", records: 166 },
      { name: "Machine Shop Companies", records: 1 },
      { name: "Rig Companies", records: 13 },
      { name: "Rental Companies", records: 17 },
      { name: "Tubing", records: 4 },
      { name: "Inspection Companies", records: 1 },
    ],
  },
  {
    key: "contacts",
    title: "Contacts",
    sourceFile: "Contacts_1784676385.xlsx",
    purpose: "Company men, superintendents, rig managers, and contacts",
    records: 136,
    columns: [
      "Name",
      "Operator/Contractor",
      "Rigs Assigned",
      "Type",
      "Salesman",
      "Title",
      "Phone",
      "Email",
      "Activities timeline",
      "Last Contact Date",
      "Next contact date",
      "Text",
      "Item ID (auto generated)",
    ],
    groups: [
      { name: "Company Contacts", records: 106 },
      { name: "Rig Contacts", records: 30 },
    ],
  },
  {
    key: "rigs",
    title: "Rigs",
    sourceFile: "Rigs_1784676367.xlsx",
    purpose: "Rig CRM, owners, service status, and providers",
    records: 309,
    columns: [
      "Name",
      "Operator Accounts",
      "Contacts",
      "County",
      "State",
      "People",
      "DTI Status",
      "DTI Service Provider",
      "DP Owner",
      "DP Size",
      "DP Connection",
      "HB Status",
      "HB Service Providers",
      "CDT Status",
      "CDT Providers",
      "Rig Wash Provider",
      "Info Last Updated",
      "Sales Strategy",
      "Item ID (auto generated)",
    ],
    groups: [
      { name: "Drilling Rigs", records: 289 },
      { name: "Workover Rig", records: 8 },
      { name: "Snubbing Units", records: 1 },
      { name: "Pipe Yard", records: 11 },
    ],
  },
  {
    key: "stacked-rigs",
    title: "Stacked Rigs",
    sourceFile: "Stacked_Rigs_1784676451.xlsx",
    purpose: "Stacked and inactive rig tracking",
    records: 60,
    columns: [
      "Name",
      "Operator Accounts",
      "Contacts",
      "County",
      "State",
      "People",
      "Status",
      "DTI Service Provider",
      "Last Inspection Date",
      "DP Owner",
      "DP Size/Connection",
      "CDT Providers",
      "HB Service Providers",
      "Rig Wash Provider",
      "Mirror",
      "Info Last Updated",
      "Sales Plan",
      "Activities timeline",
      "Item ID (auto generated)",
    ],
    groups: [{ name: "Rigs", records: 60 }],
  },
  {
    key: "customer-service",
    title: "Customer Service",
    sourceFile: "Customer_Service_1784676476.xlsx",
    purpose: "Customer issues, strategy, response, and resolution",
    records: 7,
    columns: [
      "Name",
      "Problem Strategy",
      "Customer Response To Strategy",
      "Status",
      "Service Line",
      "Operator Account",
      "Rigs",
      "Contacts",
      "Timeline - Start",
      "Timeline - End",
      "Date Created",
      "Date Completed",
      "Person Assigned",
      "Item ID (auto generated)",
    ],
    groups: [
      { name: "Pending", records: 3 },
      { name: "Resolved", records: 4 },
    ],
  },
];

export const mondayAutomationBoards: MondayAutomationBoard[] = [
  {
    sourceFile: "board_automations_18143237352.csv",
    rules: 6,
    active: 5,
    errors: 1,
    example: "When Status changes to Pending Approval, move item to group.",
  },
  {
    sourceFile: "board_automations_9483078967.csv",
    rules: 7,
    active: 1,
    errors: 0,
    example: "When an activity is created, create an item in Sales Activities.",
  },
  {
    sourceFile: "board_automations_9483078979.csv",
    rules: 1,
    active: 1,
    errors: 0,
    example: "When an activity is created, connect it to Sales Activities.",
  },
  {
    sourceFile: "board_automations_9486368823.csv",
    rules: 5,
    active: 5,
    errors: 0,
    example: "When DTI Status changes to STACKED RIG, move item to Stacked Rigs.",
  },
  {
    sourceFile: "board_automations_9769302313.csv",
    rules: 5,
    active: 5,
    errors: 0,
    example: "When Status changes to In Progress, move item to In Progress.",
  },
  {
    sourceFile: "board_automations_9778384084.csv",
    rules: 25,
    active: 23,
    errors: 0,
    example: "When Status changes to Waiting For Signature, notify someone.",
  },
  {
    sourceFile: "board_automations_9872264119.csv",
    rules: 4,
    active: 3,
    errors: 1,
    example: "When Operator Accounts changes, set Info Last Updated to today.",
  },
];

export const mondayCrmTotals = {
  boards: mondayCrmBoards.length,
  records: mondayCrmBoards.reduce((sum, board) => sum + board.records, 0),
  columns: mondayCrmBoards.reduce((sum, board) => sum + board.columns.length, 0),
  groups: mondayCrmBoards.reduce((sum, board) => sum + board.groups.length, 0),
  automationRules: mondayAutomationBoards.reduce((sum, board) => sum + board.rules, 0),
  activeAutomationRules: mondayAutomationBoards.reduce((sum, board) => sum + board.active, 0),
  automationErrors: mondayAutomationBoards.reduce((sum, board) => sum + board.errors, 0),
};
