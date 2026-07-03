import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;

if (apiKey) {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
  } catch (error) {
    console.error('Failed to initialize GoogleGenerativeAI:', error);
  }
} else {
  console.warn('GEMINI_API_KEY not found in environment. LLM services will run in Mock Fallback mode.');
}

/**
 * Generate a pre-visit summary from symptoms.
 * Prompt: "Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>"
 */
export const generatePreVisitSummary = async (symptoms) => {
  if (!symptoms || symptoms.trim() === '') {
    return {
      urgency_level: 'Low',
      chief_complaint: 'Routine wellness check',
      suggested_questions: [
        'How can I improve my general health?',
        'Are there any routine tests I need?',
        'When should I schedule my next visit?'
      ],
      raw_summary: 'Patient did not report specific symptoms.'
    };
  }

  // 1. Attempt Gemini Call if API is configured
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}
      
      Provide your response in JSON format matching this schema:
      {
        "urgency_level": "Low" | "Medium" | "High",
        "chief_complaint": "brief description of chief complaint",
        "suggested_questions": ["question 1", "question 2", "question 3"],
        "raw_summary": "a full textual summary of the analysis"
      }
      Do not include any markdown formatting like \`\`\`json or \`\`\` in the output. Just return the raw JSON string.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      
      // Clean potential JSON markdown blocks if model ignored instructions
      const cleanJsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanJsonStr);
      
      if (data.urgency_level && data.chief_complaint && Array.isArray(data.suggested_questions)) {
        return {
          urgency_level: data.urgency_level,
          chief_complaint: data.chief_complaint,
          suggested_questions: data.suggested_questions,
          raw_summary: data.raw_summary || `Urgency: ${data.urgency_level}. Chief Complaint: ${data.chief_complaint}.`
        };
      }
    } catch (error) {
      console.error('Gemini API Pre-Visit generation failed, falling back to mock generator:', error.message);
    }
  }

  // 2. Mock Fallback Mode
  console.log('Running LLM Pre-Visit in Mock Fallback mode.');
  const lowerSymptoms = symptoms.toLowerCase();
  
  let urgency = 'Low';
  if (
    lowerSymptoms.includes('chest pain') || 
    lowerSymptoms.includes('breath') || 
    lowerSymptoms.includes('severe') || 
    lowerSymptoms.includes('bleeding') || 
    lowerSymptoms.includes('unconscious') ||
    lowerSymptoms.includes('heart')
  ) {
    urgency = 'High';
  } else if (
    lowerSymptoms.includes('fever') || 
    lowerSymptoms.includes('cough') || 
    lowerSymptoms.includes('pain') || 
    lowerSymptoms.includes('vomit') || 
    lowerSymptoms.includes('migraine')
  ) {
    urgency = 'Medium';
  }

  const chiefComplaint = symptoms.split(/[.,;]/)[0].substring(0, 100) || symptoms;

  const questions = [
    `What might be causing my "${chiefComplaint.toLowerCase().trim()}"?`,
    'Are there any immediate lifestyle modifications or actions I should take?',
    'What symptoms should prompt me to seek urgent or emergency medical attention?'
  ];

  return {
    urgency_level: urgency,
    chief_complaint: chiefComplaint,
    suggested_questions: questions,
    raw_summary: `[AI Mock Summary] Urgency Level: ${urgency}. Chief Complaint: ${chiefComplaint}. Symptoms reviewed: "${symptoms}". Suggested standard medical investigation recommended.`
  };
};

/**
 * Generate a post-visit summary from clinical notes.
 * Prompt: "Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>"
 */
export const generatePostVisitSummary = async (notes) => {
  if (!notes || notes.trim() === '') {
    return 'No visit notes provided.';
  }

  // 1. Attempt Gemini Call if API is configured
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${notes}
      
      Structure the output with clear, user-friendly language. Avoid overly dense medical jargon where possible. Include a section for:
      - Patient-Friendly Summary
      - Medication Schedule
      - Next Steps & Follow-up`;

      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Gemini API Post-Visit generation failed, falling back to mock generator:', error.message);
    }
  }

  // 2. Mock Fallback Mode
  console.log('Running LLM Post-Visit in Mock Fallback mode.');
  return `[AI Mock Post-Visit Summary]
Thank you for your visit today. Here is a friendly summary of your consultation:

Overview:
We reviewed your current health concerns. Based on our discussion, we have outlined a care plan.

Medication Schedule & Care Instructions:
- Please take any prescribed medications exactly as directed. Refer to your prescription details for precise dosages.
- If you notice any unexpected side effects, contact the clinic immediately.

Follow-up Steps:
- Monitor your symptoms over the next few days.
- Schedule a follow-up appointment if symptoms persist or as discussed during the consultation.
- Clinical Notes Reference: "${notes}"`;
};
export default { generatePreVisitSummary, generatePostVisitSummary };
