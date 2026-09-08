// Seeds MedicalScheduleTemplate rows so the medical_info_schedules ("Medical
// Progress") screen has real data to drive its checkup/vaccination progress
// bar against.
//
// This is the real official Danish børneundersøgelser/vaccinationsprogram
// schedule, sourced from docs/assets/denmark_child_health_timeline.xlsx (a
// 16-row table: Age/Stage, Event Category, Description, Service Provider,
// Notes) — replacing the earlier first-pass approximation this file used to
// carry. Each xlsx row that combined a health check with a vaccine dose is
// split into two independently trackable template rows here, matching how
// this schedule is presented in the app (one checkbox per real-world thing a
// parent does).
import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();

const DK_SCHEDULE: {
  label: string;
  ageInMonths: number;
  category: "checkup" | "vaccination" | "dental" | "school_health";
  provider: string;
  description?: string;
  isRecurring?: boolean;
  recurrenceMonths?: number;
}[] = [
  {
    label: "First Health Check (5 weeks)",
    ageInMonths: 1,
    category: "checkup",
    provider: "General Practitioner (GP)",
    description: "First physical health examination focusing on growth, reflexes, and development.",
  },
  {
    label: "DiTeKiPolHib + Pneumococcal (1st dose)",
    ageInMonths: 3,
    category: "vaccination",
    provider: "General Practitioner (GP)",
    description: "Diphtheria, Tetanus, Whooping Cough, Polio, Hib, and Pneumococcal.",
  },
  {
    label: "Dental Care Welcome",
    ageInMonths: 3,
    category: "dental",
    provider: "Municipal Dental Care",
    description: "Automated digital welcome and introduction from the Municipal Dental Care (Tandplejen).",
  },
  {
    label: "Health Check (5 months)",
    ageInMonths: 5,
    category: "checkup",
    provider: "General Practitioner (GP)",
    description: "Second medical health check.",
  },
  {
    label: "DiTeKiPolHib + Pneumococcal (2nd dose)",
    ageInMonths: 5,
    category: "vaccination",
    provider: "General Practitioner (GP)",
    description: "Second dose of DiTeKiPolHib + Pneumococcal vaccine.",
  },
  {
    label: "Health Check (12 months)",
    ageInMonths: 12,
    category: "checkup",
    provider: "General Practitioner (GP)",
    description: "Third medical health check.",
  },
  {
    label: "DiTeKiPolHib + Pneumococcal (3rd dose)",
    ageInMonths: 12,
    category: "vaccination",
    provider: "General Practitioner (GP)",
    description: "Third dose of DiTeKiPolHib + Pneumococcal vaccine.",
  },
  {
    label: "First Dental Visit",
    ageInMonths: 14,
    category: "dental",
    provider: "Municipal Dental Care",
    description: "Automated invitation from Tandplejen for a baseline check and advice.",
  },
  {
    label: "MMR (1st dose)",
    ageInMonths: 15,
    category: "vaccination",
    provider: "General Practitioner (GP)",
    description: "First MMR (MFR) vaccine safeguarding against Measles, Mumps, and Rubella.",
  },
  {
    label: "Health Check (2 years)",
    ageInMonths: 24,
    category: "checkup",
    provider: "General Practitioner (GP)",
    description: "Fourth medical health examination evaluating general wellness, speech, and motor skills.",
  },
  {
    label: "Health Check (3 years)",
    ageInMonths: 36,
    category: "checkup",
    provider: "General Practitioner (GP)",
    description: "Fifth medical health examination evaluating general milestone development.",
  },
  {
    label: "Health Check (4 years)",
    ageInMonths: 48,
    category: "checkup",
    provider: "General Practitioner (GP)",
    description: "Sixth medical health examination.",
  },
  {
    label: "MMR (2nd dose / booster)",
    ageInMonths: 48,
    category: "vaccination",
    provider: "General Practitioner (GP)",
    description: "Second dose of the MMR (MFR) booster vaccine.",
  },
  {
    label: "Health Check (5 years)",
    ageInMonths: 60,
    category: "checkup",
    provider: "General Practitioner (GP)",
    description: "Final routine GP health examination.",
  },
  {
    label: "DiTeKiPol Booster (final)",
    ageInMonths: 60,
    category: "vaccination",
    provider: "General Practitioner (GP)",
    description: "Final DiTeKiPol booster vaccine.",
  },
  {
    label: "School Health Screening",
    ageInMonths: 72,
    category: "school_health",
    provider: "School Nurse",
    description:
      "Transition to School Nurse (Sundhedsplejerske) for ongoing growth, vision, and hearing screenings.",
  },
  {
    label: "Routine Dental Screening",
    ageInMonths: 24,
    category: "dental",
    provider: "Municipal Dental Care",
    description: "Routine dental screening every 12 months. Free treatments, fillings, and braces if needed.",
    isRecurring: true,
    recurrenceMonths: 12,
  },
  {
    label: "HPV Vaccination",
    ageInMonths: 144,
    category: "vaccination",
    provider: "General Practitioner (GP)",
    description: "HPV vaccination offered for both boys and girls, protecting against cervical and reproductive cancers.",
  },
  {
    label: "Free Dental Care Eligibility Ends",
    ageInMonths: 216,
    category: "dental",
    provider: "Municipal Dental Care",
    description: "Free dental care is extended until the 22nd birthday for individuals born in 2004 or later.",
  },
];

async function main() {
  // The labels/structure below are a full replacement of the DK schedule
  // (not an additive update), so clear existing DK templates first rather
  // than skip-if-exists — a skip would leave the old approximated rows
  // sitting alongside these as stale duplicates. Cascades to any existing
  // ChildScheduleOccurrence rows, which is expected for this dev-only reset.
  await prisma.medicalScheduleTemplate.deleteMany({ where: { countryCode: "DK" } });
  for (const item of DK_SCHEDULE) {
    await prisma.medicalScheduleTemplate.create({
      data: { countryCode: "DK", ...item },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${DK_SCHEDULE.length} DK medical schedule templates.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
