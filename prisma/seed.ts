import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const privileges = [
  {
    name: "create-post",
    displayName: "Create Post",
    description: "Can create posts with a post length limit of 150 characters.",
  },
  {
    name: "create-extended-post",
    displayName: "Create Extended Pos",
    description: "Can create posts with a post length limit of 300 characters.",
  },
  {
    name: "create-lengthy-post",
    displayName: "Create Lengthy Post",
    description:
      "Can create posts with a post length limit of 1000 characters.",
  },
  {
    name: "ban-user",
    displayName: "Ban User",
    description: "Can ban users.",
  },
  {
    name: "annotate-post",
    displayName: "Annotate Post",
    description: "Can annotate posts.",
  },
];

async function main() {
  console.log("Start seeding ...");

  await Promise.all(
    privileges.map(async (privilege) => {
      try {
        await prisma.privilege.upsert({
          where: { name: privilege.name },
          update: {},
          create: privilege,
        });
      } catch (e) {
        console.error(e);
      }
    })
  );

  console.log("Seeding completed.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
