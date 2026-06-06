export const CONTACT_EMAIL = "contact@downpricer.com";

type BuildContactMailtoOptions = {
  subject?: string;
  body?: string;
  email?: string;
};

export function buildContactMailto({
  subject,
  body,
  email = CONTACT_EMAIL,
}: BuildContactMailtoOptions = {}): string {
  const params = new URLSearchParams();

  if (subject) {
    params.set("subject", subject);
  }

  if (body) {
    params.set("body", body);
  }

  const query = params.toString();
  return query ? `mailto:${email}?${query}` : `mailto:${email}`;
}

export function buildVirtualVisitMailto() {
  return buildContactMailto({
    subject: "Demande de visite virtuelle",
    body: [
      "Bonjour,",
      "",
      "Je souhaiterais avoir plus d'informations pour mettre mon bien en visite virtuelle.",
      "",
      "Merci.",
    ].join("\n"),
  });
}

export function buildPropertyInquiryMailto(title: string, pageUrl: string) {
  return buildContactMailto({
    subject: `Demande d'information - ${title}`,
    body: [
      "Bonjour,",
      "",
      "Je vous contacte concernant le bien suivant :",
      title,
      pageUrl,
      "",
      "Je souhaiterais avoir plus d'informations.",
      "",
      "Merci.",
    ].join("\n"),
  });
}
