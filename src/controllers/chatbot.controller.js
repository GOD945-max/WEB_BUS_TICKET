// [TV3 viết / TV5 commit] API AJAX Trợ lý ảo (Chatbot)
const ChatbotController = {
  async ask(req, res) {
    const { message = '' } = req.body;
    res.json({
      success: true,
      reply: `Trợ lý ảo FUTA đã nhận câu hỏi: "${message}". Vui lòng nhập mã vé (VD: FUTA839201) để tra cứu nhanh!`,
    });
  },
};

module.exports = ChatbotController;
