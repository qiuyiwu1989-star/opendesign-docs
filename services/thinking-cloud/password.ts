// Password is read from stdin, never command-line arguments or shell history.
import {hashPassword} from './server';
let value='';for await(const chunk of process.stdin)value+=chunk;
const password=value.replace(/\r?\n$/,'');
if(password.length<14)throw Error('Use at least 14 characters');
console.log(hashPassword(password));
