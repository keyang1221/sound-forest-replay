// Exhibition data includes Tuesday through Sunday; raw source files stay untouched.
export function isIncludedDate(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const value=new Date(`${date}T00:00:00Z`);
 return Number.isFinite(value.getTime())&&value.toISOString().slice(0,10)===date&&value.getUTCDay()!==1;
}
