import { GoogleGenerativeAI } from '@google/generative-ai';
import { VertexAI } from '@google-cloud/vertexai';
import config from './config.js';

let genAI = null;
let vertexAI = null;

function getModelInstance() {
  if (process.env.VERTEX_PROJECT_ID) {
    if (!vertexAI) {
      vertexAI = new VertexAI({
        project: process.env.VERTEX_PROJECT_ID,
        location: process.env.VERTEX_LOCATION || 'us-central1'
      });
    }
    const modelName = config.gemini.model || 'gemini-2.5-flash-lite';
    return vertexAI.preview.getGenerativeModel({ model: modelName });
  } else {
    if (!genAI) {
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    const modelName = config.gemini.model || 'gemini-3.1-flash-lite-preview';
    return genAI.getGenerativeModel({ model: modelName });
  }
}

/**
 * Build the analysis prompt for Gemini
 */
function buildPrompt(threads) {
  const { ownerName, companyName, industry, country } = config.businessContext || {
    ownerName: "Owner",
    companyName: "Company",
    industry: "Business",
    country: "Global"
  };

  const threadSummaries = threads.map((t, i) => {
    const msgs = t.snippets
      .map((s) => `  [${s.date}] ${s.from}: "${s.snippet}"`)
      .join('\n');
    return `
--- Thread ${i + 1} ---
Subject: ${t.subject}
Last sender: ${t.lastSender} (${t.lastSenderDomain})
Messages: ${t.messageCount}
Hours since last message: ${t.hoursSinceLastMessage}h

Messages:
${msgs}`;
  }).join('\n\n');

  return `You are a sharp business intelligence assistant for a company owner.
Analyze incoming email threads and return a JSON array. Raw JSON only — no prose, no markdown fences.

BUSINESS CONTEXT:
- Owner: ${ownerName}
- Company: ${companyName}
- Industry: ${industry}
- Location: ${country}

PRIORITY RULES:
- "High"  → Requires owner action today. Revenue, legal, security, or relationship at stake.
- "Medium" → Needs response within 2-3 days. No immediate risk.
- "Low"   → Informational only. No action urgency.
- "Ignore" → ONLY pure spam, mass marketing, or irrelevant newsletters with zero business value.

NEVER IGNORE:
- Security alerts, billing, account changes, transaction receipts
- Any email from a real human (client, vendor, employee, partner)
- Legal/government/tax correspondence
- Contract or renewal discussions
- Overdue payment reminders or financial disputes

LANGUAGE: If non-English, translate before analysis. Note original language in detected_language.

OUTPUT SCHEMA — return a JSON array with one object per thread:
[
  {
    "thread_index": 1,
    "subject_summary": "one clear line",
    "detected_language": "English | Turkish | German | ...",
    "sender_type": "Client | Prospect | Vendor | Employee | Legal/Gov | Cold Outreach | Automated | Unknown",
    "priority": "High | Medium | Low | Ignore",
    "reply_needed": true,
    "opportunity_flag": false,
    "opportunity_type": "New Lead | Upsell | Partnership | Contract Renewal | null",
    "financial_flag": false,
    "financial_detail": "short description or null",
    "legal_flag": false,
    "legal_context": "short description or null",
    "deadline": "YYYY-MM-DD or null",
    "deadline_context": "short description or null",
    "delegate_to": "Accountant | Lawyer | Sales Team | HR | Handle Yourself | null",
    "why_it_matters": "1-2 lines, specific business impact",
    "risk_of_not_replying": "direct and honest — what actually breaks if ignored",
    "recommended_action": "one specific next step",
    "draft_reply": "direct, confident, written as company owner — or null if reply_needed is false"
  }
]

TONE FOR draft_reply:
Write as the company owner — confident, brief, commercially sharp.
No filler phrases. Get to the point in the first sentence.
If the email is demanding or aggressive, respond firmly but professionally.

THREADS TO ANALYZE:
${threadSummaries}
`;
}

/**
 * Analyze filtered threads using Gemini
 */
export async function analyzeThreads(threads) {
  if (threads.length === 0) return [];

  const model = getModelInstance();
  const prompt = buildPrompt(threads);

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response || result;
    
    let text = '';
    if (typeof response.text === 'function') {
      text = response.text().trim();
    } else if (response.candidates && response.candidates[0]?.content?.parts?.length > 0) {
      text = response.candidates[0].content.parts[0].text.trim();
    } else {
      throw new Error('Failed to parse text from AI response object');
    }

    // Strip markdown code fences if present
    text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    const analyses = JSON.parse(text);

    // Merge analyses back into thread data
    return threads.map((thread, i) => {
      const analysis = analyses.find((a) => a.thread_index === i + 1) || analyses[i] || {};
      return {
        ...thread,
        priority: analysis.priority || 'Low',
        whyItMatters: analysis.why_it_matters || 'N/A',
        riskOfNotReplying: analysis.risk_of_not_replying || 'N/A',
        recommendedAction: analysis.recommended_action || 'Review and reply',
        draftReply: analysis.draft_reply || '',
        subjectSummary: analysis.subject_summary || thread.subject,
        detectedLanguage: analysis.detected_language,
        senderType: analysis.sender_type,
        replyNeeded: analysis.reply_needed,
        opportunityFlag: analysis.opportunity_flag,
        opportunityType: analysis.opportunity_type,
        financialFlag: analysis.financial_flag,
        financialDetail: analysis.financial_detail,
        legalFlag: analysis.legal_flag,
        legalContext: analysis.legal_context,
        deadline: analysis.deadline,
        deadlineContext: analysis.deadline_context,
        delegateTo: analysis.delegate_to
      };
    });
  } catch (err) {
    console.error('❌ Gemini analysis failed:', err.message);
    // Return threads with default values if Gemini fails
    return threads.map((thread) => ({
      ...thread,
      priority: 'Medium',
      whyItMatters: 'Analysis unavailable — review manually',
      riskOfNotReplying: 'Unknown',
      recommendedAction: 'Review and reply',
      draftReply: '',
    }));
  }
}
