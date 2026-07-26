// Pure helper: builds the personalised summary sentence from the raw answers
// captured during the quiz. Used by both the home-embedded quiz and the
// /quiz page. Safe to import from anywhere — no React, no side effects.

export function buildQuizStory(
  answers: Record<string, string>,
  opts: { productCount?: number } = {}
): string {
  const parts: string[] = [];
  const isGift = answers.shopper === "gift";

  // Opener
  if (isGift) {
    parts.push("A personalised gift bundle");
    if (answers.giftRelationship) parts.push(`for a ${answers.giftRelationship}`);
    if (answers.giftOccasion) parts.push(`for ${answers.giftOccasion}`);
  } else {
    parts.push("Here is what we have put together for you");
  }

  // Scope
  const scopeLabels: Record<string, string> = {
    "hospital-bag": "a hospital bag",
    "general-baby-prep": "baby prep essentials",
    "hospital-bag+general": "a hospital bag and baby prep essentials",
  };
  if (answers.scope && scopeLabels[answers.scope]) parts.push(`— ${scopeLabels[answers.scope]}`);

  // Budget
  const budgetLabels: Record<string, string> = {
    starter: "a starter budget",
    standard: "a standard budget",
    premium: "a premium budget",
  };
  if (answers.budget && budgetLabels[answers.budget]) parts.push(`within ${budgetLabels[answers.budget]}`);

  // Gender
  if (answers.gender && answers.gender !== "neutral") {
    const genderLabel = answers.gender === "boy" ? "baby boy" : answers.gender === "girl" ? "baby girl" : "babies";
    parts.push(`for your ${genderLabel}`);
  }

  // Multiples
  if (answers.multiples === "2") parts.push("(twins! 👶👶)");
  else if (answers.multiples === "3") parts.push("(triplets! 👶👶👶)");

  // Stage
  const stage = answers.stage || answers.wifeStage || answers.giftAge;
  if (stage === "expecting" || stage === "newborn") parts.push("for the newborn days");
  else if (stage === "0-3m") parts.push("for the first three months");
  else if (stage === "3-6m") parts.push("for three to six months");
  else if (stage === "6-12m") parts.push("for six to twelve months");

  // Hospital type
  if (answers.hospitalType === "private") parts.push("planned for a private hospital");
  else if (answers.hospitalType === "public") parts.push("planned for a public hospital");

  // Delivery method
  if (answers.deliveryMethod === "csection") parts.push("with C-section recovery essentials included");

  // Gift wrap
  if (answers.giftWrap === "yes") parts.push("— beautifully gift-wrapped");

  const sentence = parts.join(" ").replace(/\s+/g, " ").trim() + ".";
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
