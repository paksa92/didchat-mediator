import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const privileges = [
  {
    name: "root",
    displayName: "Root",
    description: "Root privilege.",
  },
  {
    name: "admin",
    displayName: "Admin",
    description: "Admin privilege.",
  },
  {
    name: "moderator",
    displayName: "Moderator",
    description: "Moderator privilege.",
  },
  {
    name: "suspend-user",
    displayName: "Suspend User",
    description: "Can suspend users.",
  },
  {
    name: "hide-post",
    displayName: "Hide Post",
    description: "Can hide posts.",
  },
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
