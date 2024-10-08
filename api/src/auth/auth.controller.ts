import { Router } from "express";
import jwt, { JwtPayload } from 'jsonwebtoken';
import dotenv from 'dotenv';
import { SigninFormSchema, SignupFormSchema } from "../lib/definations";
import { PrismaClient } from "@prisma/client";
import bcrypt from 'bcryptjs';
dotenv.config();

const prisma = new PrismaClient();

export const auth = Router();

auth.post('/signup', async (req, res): Promise<any> => {
    const string = req.headers.authorization;
    if (!string) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = string.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    if (!decoded) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const vaildFields = SignupFormSchema.safeParse(decoded.data);

    if (!vaildFields.success) {
        return res.status(400).json({ message: 'Invalid data' });
    }
    
    const { name, email, password } = vaildFields.data;

    const user = await prisma.user.findFirst({
        where: {
            email: email,
        },
    })

    if(user) {
        return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
        data: {
            name: name,
            email: email,
            password: hashedPassword,
        }
    });

    if(!newUser){
        return res.status(500).json({ message: 'Internal server error' });
    }

    const tokenData = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
    }

    return res.status(200).json(tokenData);
});



auth.post('/signin', async (req, res): Promise<any> => {
    const string = req.headers.authorization;
    // console.log(string);
    if (!string) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = string.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    if (!decoded) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const vaildFields = SigninFormSchema.safeParse(decoded.data);

    if (!vaildFields.success) {
        return res.status(400).json({ message: 'Invalid data' });
    }
    
    const { email, password } = vaildFields.data;

    const user = await prisma.user.findFirst({
        where: {
            email: email,
        },
    })

    if(!user) {
        return res.status(400).json({ message: 'User does not exists' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    // console.log("IsPassword vaild : ",isPasswordValid);

    if(!isPasswordValid) {
        return res.status(400).json({ message: 'Invalid password' });
    }

    const tokenData = {
        id: user.id,
        name: user.name,
        email: user.email,
    }

    // console.log("Token data : ",tokenData);
    return res.status(200).json(tokenData);
});