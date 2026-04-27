import ContactSalesPage, { dynamic, metadata } from "../contact-sales/page";

export { metadata };
export { dynamic };

type ContactPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContactPage(props: ContactPageProps) {
  try {
    return await ContactSalesPage(props);
  } catch (err) {
    console.error("CONTACT RENDER FAIL:", err);
    throw err;
  }
}
