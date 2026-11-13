// [TV5 - Nhóm 5: Vé điện tử, vận hành, báo cáo và trợ lý ảo] API AJAX Trợ lý ảo hỗ trợ tìm chuyến, tra cứu vé & giải đáp chính sách
const ChatbotController = {
  async ask(req, res) {
    const { message = '' } = req.body;
    res.json({
      success: true,
      reply: `Trợ lý ảo FUTA đã nhận câu hỏi: "${message}". Tôi có thể hỗ trợ bạn tìm chuyến xe, tra cứu vé bằng mã đặt chỗ hoặc giải đáp chính sách hoàn/hủy vé!`,
    });
  },
};

module.exports = ChatbotController;
