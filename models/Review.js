import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reviewee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task" },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

export default mongoose.model("Review", reviewSchema);
