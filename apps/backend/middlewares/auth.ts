import type { NextFunction, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if(!supabaseUrl || !supabaseSecretKey){
    throw new Error("Missing Supabase Environment Variables")
}

const supabase = createClient(
  supabaseUrl, supabaseSecretKey
);

export async function middleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization;
  console.log("middleware outside try");
  try {
    const {data: {user}, error} = await supabase.auth.getUser(token);
    const address = user?.user_metadata.custom_claims.address;
    if(address){
        console.log("inside middleware if body");
        req.userId = address;
        next();
    }else {
        res.status(403).json({
            message: "Incorrect Credentials"
        })
    }
  }catch(error){
    res.status(403).json({
        message: "Incorrect Credentials"
    })
  }
}
