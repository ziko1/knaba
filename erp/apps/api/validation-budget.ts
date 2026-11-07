import type {Request,Response,NextFunction} from 'express';
import {DomainError} from '../../packages/domain/core.ts';
import {assertValidationInputBudget} from '../../packages/validation/input-budget.ts';

/** Runs after byte-bounded JSON parsing and before any controller validation. */
export function validationInputBudgetMiddleware(req:Request,res:Response,next:NextFunction):void {
 try{
  assertValidationInputBudget(req.body);
  assertValidationInputBudget(req.query);
  next();
 }catch(error){
  if(!(error instanceof DomainError)){next(error);return;}
  res.setHeader('Cache-Control','private, no-store');
  res.status(400).json({code:'VALIDATION_ERROR',details:{reason:'VALIDATION_INPUT_LIMIT_EXCEEDED'}});
 }
}
