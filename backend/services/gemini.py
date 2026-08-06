import json
import logging
from typing import Optional

import google.generativeai as genai
from pydantic import ValidationError

import config
from models.transaction import ParsedTransaction

logger = logging.getLogger(__name__)

genai.configure(api_key=config.GEMINI_API_KEY)

_SYSTEM_INSTRUCTION = """Você é um parser de transações financeiras para mensagens em português brasileiro informal.
Analise a mensagem e retorne SOMENTE um objeto JSON, sem texto adicional, com este esquema:

{
  "parseable": boolean,
  "type": "despesa" | "receita",
  "amount": número positivo (float),
  "category": string em português (saúde, alimentação, transporte, renda, vestuário, lazer, moradia, educação, outros),
  "description": string curta descrevendo a transação,
  "installments": inteiro >= 1 (padrão 1)
}

Se a mensagem NÃO for uma transação financeira, retorne exatamente: {"parseable": false}

Regras de interpretação:
- "paguei", "gastei", "comprei", "fui", verbos de gasto → type: "despesa"
- "recebi", "salário", "caiu", "entrou", "freela", "pix" de recebimento → type: "receita"
- Valores por extenso → converta para float ("quarenta e cinco" → 45.0)
- Valores negativos → converta para positivo
- Abreviações → expanda para categoria mais provável ("acad" → saúde, "uber" → transporte)
- Parcelamento: "3x 150", "em 3x", "3 vezes" → installments: 3, amount: 150
- Quando só um número sem contexto → tente despesa genérica; se impossível → parseable: false"""


class GeminiUnavailableError(Exception):
    pass


async def parse_transaction(text: str) -> Optional[ParsedTransaction]:
    model = genai.GenerativeModel(
        model_name="gemini-3.1-flash-lite",
        system_instruction=_SYSTEM_INSTRUCTION,
    )

    try:
        response = await model.generate_content_async(
            text,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            ),
        )
    except Exception as e:
        raise GeminiUnavailableError("Gemini API call failed") from e

    try:
        data = json.loads(response.text)
        parsed = ParsedTransaction.model_validate(data)
    except (json.JSONDecodeError, ValidationError):
        logger.error("Failed to parse Gemini response: %s", response.text)
        return None

    if not parsed.parseable or parsed.amount is None or parsed.amount <= 0:
        return None

    parsed.amount = abs(parsed.amount)
    return parsed
