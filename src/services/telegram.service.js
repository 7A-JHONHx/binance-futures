import axios from "axios";
import { logError, logWarn } from "../utils/logger.js";

export async function sendMessage(text) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    logWarn("Telegram not configured, skipping notification");
    return false;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
    });

    return true;
  } catch (error) {
    logError("Failed to send Telegram message", error);
    return false;
  }
}
