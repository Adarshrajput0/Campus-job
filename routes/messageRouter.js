const express = require("express");
const messageController = require("../controllers/messageController");
const upload = require("../utils/multer");
const router = express.Router();

router.get("/chat/:bookingId", messageController.getChat);
router.post("/chat/:bookingId", upload.single("attachment"), messageController.postMessage);
router.post("/message/delete/:messageId", messageController.deleteMessage);

module.exports = router;
