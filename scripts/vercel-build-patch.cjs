const fs = require("fs");

const patches = [
  {
    file: "app/admin/page.tsx",
    replacements: [
      [
        "current.filter((id) => mappedRacks.some((rack) => rack.id === id))",
        "current.filter((id) => mappedRacks.some((rack: Rack) => rack.id === id))",
      ],
      [
        "})).filter((option) => option.label && option.isActive);",
        "})).filter((option: InventoryOption) => option.label && option.isActive);",
      ],
    ],
  },
  {
    file: "app/customer/page.tsx",
    replacements: [
      [
        '.filter((row) => row.status !== "Shipped" && (row.joints > 0 || row.footage > 0))',
        '.filter((row: CustomerInventory) => row.status !== "Shipped" && (row.joints > 0 || row.footage > 0))',
      ],
    ],
  },
  {
    file: "app/hardband/page.tsx",
    replacements: [
      [
        'mappedJobs.find((job) => job.status !== "Closed")',
        'mappedJobs.find((job: HardbandJob) => job.status !== "Closed")',
      ],
    ],
  },
  {
    file: "app/page.tsx",
    replacements: [
      [
        ".filter((company) => company.name.trim())",
        ".filter((company: CompanyOption) => company.name.trim())",
      ],
      [
        '.filter((option) => option.label && ["status", "condition"].includes(option.optionType));',
        '.filter((option: InventoryOption) => option.label && ["status", "condition"].includes(option.optionType));',
      ],
    ],
  },
  {
    file: "app/ticket-print/page.tsx",
    replacements: [
      [
        "(lineData ?? []).map((line) => {",
        "(lineData ?? []).map((line: any) => {",
      ],
    ],
  },
];

for (const patch of patches) {
  if (!fs.existsSync(patch.file)) {
    continue;
  }

  const original = fs.readFileSync(patch.file, "utf8");
  let updated = original;

  for (const [from, to] of patch.replacements) {
    if (updated.includes(from)) {
      updated = updated.replace(from, to);
    }
  }

  if (updated !== original) {
    fs.writeFileSync(patch.file, updated);
  }
}

console.log("Applied Vercel build compatibility patch.");
