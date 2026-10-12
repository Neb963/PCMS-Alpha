// Statically evaluate the unmodified donor fail-closed gate before registering
// PCMS wake sources. Neither module awaits during listener registration.
import '../lib/recovery-bootstrap.js';
import './wake.mjs';
// Independent PCMS journal/command listener; it never controls donor recovery.
import './command-boundary.mjs';
// I03 listeners are registered in the synchronous entry evaluation path.
import './account-boundary.mjs';
