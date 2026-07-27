const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const destinations = [
  ["campus-tour", "University campus tour", "Explore a welcoming campus and its landmarks.", "Pilot City", "Main visitor entrance", "Education", [30, 45, 60], false],
  ["historic-downtown", "Historic downtown walk", "See civic landmarks, architecture, and public squares.", "Pilot City", "Central public square", "History", [30, 45, 60], false],
  ["cultural-venue", "Museum or cultural venue", "Visit a public cultural venue and explore current exhibits.", "Pilot City", "Venue information desk", "Culture", [30, 45, 60], false],
  ["waterfront-visit", "Nature or waterfront visit", "Enjoy an accessible outdoor route with scenic stops.", "Pilot City", "Waterfront visitor area", "Outdoors", [30, 45, 60], false],
  ["shopping-district", "Shopping district", "Browse local shops and public market areas.", "Pilot City", "District welcome point", "Shopping", [30, 45], false],
  ["custom-destination", "Custom destination", "Describe another public place in the pilot operating area.", "Pilot City", "Public meeting point", "Custom", [15, 30, 45, 60], true],
];

async function main() {
  for (const [slug, name, shortDescription, city, meetingArea, category, durationOptions, custom] of destinations) {
    await prisma.destination.upsert({
      where: { slug },
      update: { name, shortDescription, city, meetingArea, category, durationOptions, custom, active: true },
      create: { slug, name, shortDescription, city, meetingArea, category, durationOptions, custom },
    });
  }
}

main().finally(() => prisma.$disconnect());
