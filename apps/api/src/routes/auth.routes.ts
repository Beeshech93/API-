import { Router } from "express";
import { asyncHandler } from "@/utils/asyncHandler";
import { loginSchema, signupSchema } from "@/validators/auth.validators";
import * as authService from "@/services/auth.service";

export const authRouter = Router();

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const input = signupSchema.parse(req.body);
    const result = await authService.signup(input.email, input.password, input.name);
    res.status(201).json(result);
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input.email, input.password);
    res.status(200).json(result);
  })
);
