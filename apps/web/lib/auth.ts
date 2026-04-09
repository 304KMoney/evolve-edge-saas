export type AppSession = {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organization: {
    id: string;
    slug: string;
    name: string;
    role: string;
  };
};

// Temporary auth seam for MVP scaffolding.
// Replace with Clerk server-side auth and organization context.
export async function getCurrentSession(): Promise<AppSession> {
  return {
    user: {
      id: "demo_founder_user",
      email: "founder@lawsonhealth.example",
      firstName: "Jordan",
      lastName: "Lawson"
    },
    organization: {
      id: "demo_org",
      slug: "lawson-health-group",
      name: "Lawson Health Group",
      role: "OWNER"
    }
  };
}

