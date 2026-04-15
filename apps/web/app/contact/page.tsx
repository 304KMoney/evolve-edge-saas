import ContactSalesPage, { dynamic, metadata } from "../contact-sales/page";

export { metadata };
export { dynamic };

export default async function ContactPage(props: Parameters<typeof ContactSalesPage>[0]) {
  try {
    return await ContactSalesPage(props);
  } catch (err) {
    console.error("CONTACT RENDER FAIL:", err);
    throw err;
  }
}
