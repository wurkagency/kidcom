// Seeds MedicalScheduleTemplate rows so the medical_info_schedules screen has
// real data to drive its vaccination/checkup progress bar against.
//
// NOTE: the Danish (DK) entries below are a first-pass approximation of the
// børnevaccinationsprogram (childhood vaccination programme) at a level
// suitable for prototyping. Double-check every label/age against the actual
// current schedule (sst.dk) before this is real-user-facing — do not treat
// this file as medical guidance.
import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();

const DK_SCHEDULE: {
  label: string;
  ageInMonths: number;
  category: "vaccination" | "checkup" | "dentist";
  description?: string;
}[] = [
  { label: "DiTeKiPol-Hib (1st dose)", ageInMonths: 3, category: "vaccination", description: "Diphtheria, tetanus, pertussis, polio, Hib" },
  { label: "DiTeKiPol-Hib (2nd dose)", ageInMonths: 5, category: "vaccination", description: "Diphtheria, tetanus, pertussis, polio, Hib" },
  { label: "DiTeKiPol-Hib (3rd dose)", ageInMonths: 12, category: "vaccination", description: "Diphtheria, tetanus, pertussis, polio, Hib" },
  { label: "MFR (1st dose)", ageInMonths: 15, category: "vaccination", description: "Measles, mumps, rubella" },
  { label: "DiTeKiPol booster", ageInMonths: 60, category: "vaccination", description: "Diphtheria, tetanus, pertussis, polio booster" },
  { label: "MFR (2nd dose)", ageInMonths: 48, category: "vaccination", description: "Measles, mumps, rubella" },
  { label: "5-year checkup", ageInMonths: 60, category: "checkup", description: "Routine child health checkup" },
  { label: "Dentist checkup", ageInMonths: 36, category: "dentist", description: "Recommended first dental checkup" },
  { label: "Dentist checkup (annual)", ageInMonths: 60, category: "dentist", description: "Routine annual dental checkup" },
];

async function main() {
  for (const item of DK_SCHEDULE) {
    const existing = await prisma.medicalScheduleTemplate.findFirst({
      where: { countryCode: "DK", label: item.label, ageInMonths: item.ageInMonths },
    });
    if (existing) continue;
    await prisma.medicalScheduleTemplate.create({
      data: { countryCode: "DK", ...item },
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${DK_SCHEDULE.length} DK medical schedule templates (skipping duplicates).`);
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
