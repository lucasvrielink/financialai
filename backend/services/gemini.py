import json
import logging

import google.generativeai as genai
from pydantic import ValidationError

import config
from models.transaction import ParsedTransaction, ParsedTransactionList

logger = logging.getLogger(__name__)

genai.configure(api_key=config.GEMINI_API_KEY)

_SYSTEM_INSTRUCTION = """Você é um parser de transações financeiras para mensagens em português brasileiro informal.
A mensagem pode conter UMA ou MAIS transações separadas por conectivos ("e", "mais", vírgula, etc.).

Retorne SOMENTE um objeto JSON, sem texto adicional, com este esquema:
{
  "transactions": [
    {
      "parseable": boolean,
      "type": "despesa" | "receita",
      "amount": número positivo (float),
      "category": string em português (saúde, alimentação, transporte, renda, vestuário, lazer, moradia, educação, outros),
      "description": string curta descrevendo a transação,
      "installments": inteiro >= 1 (padrão 1)
    }
  ]
}

Se a mensagem NÃO contiver nenhuma transação financeira, retorne: {"transactions": [{"parseable": false}]}

Regras de interpretação:
- "paguei", "gastei", "comprei", "fui", verbos de gasto → type: "despesa"
- "recebi", "salário", "caiu", "entrou", "freela", "pix" de recebimento → type: "receita"
- Valores por extenso → converta para float ("quarenta e cinco" → 45.0)
- Valores negativos → converta para positivo
- Abreviações → expanda para categoria mais provável ("acad" → saúde, "uber" → transporte)
- Parcelamento: "3x 150", "em 3x", "3 vezes" → installments: 3, amount: 150
- Quando só um número sem contexto → tente despesa genérica; se impossível → parseable: false
- Cada item separado por "e", "mais", vírgula ou ponto-e-vírgula é uma transação distinta"""


class GeminiUnavailableError(Exception):
    pass


async def parse_transactions(text: str) -> list[ParsedTransaction]:
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
        result = ParsedTransactionList.model_validate(data)
    except (json.JSONDecodeError, ValidationError):
        logger.error("Failed to parse Gemini response: %s", response.text)
        return []

    valid = []
    for item in result.transactions:
        if item.parseable and item.amount and item.amount > 0:
            item.amount = abs(item.amount)
            valid.append(item)

    return valid
