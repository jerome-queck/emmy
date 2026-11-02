--------------------------- MODULE RunTransitions ---------------------------
EXTENDS Naturals, TLC
CONSTANT Mutant
VARIABLES present, execution, receipt, terminalBroken, receiptBroken, inferred
vars == <<present, execution, receipt, terminalBroken, receiptBroken, inferred>>
Executions == {"unknown", "running", "blocked", "pending-approval", "completed", "failed", "skipped"}
Terminal == {"completed", "failed", "skipped"}
Receipts == {"pending", "accepted", "verified", "failed"}
Init == /\ present = FALSE /\ execution = "unknown" /\ receipt = "pending"
        /\ terminalBroken = FALSE /\ receiptBroken = FALSE /\ inferred = FALSE
CreateRun == /\ ~present /\ present' = TRUE /\ execution' \in Executions
             /\ UNCHANGED <<receipt, terminalBroken, receiptBroken, inferred>>
ReviseRun == /\ present /\ \E next \in Executions:
               /\ (execution \notin Terminal \/ next = execution \/ Mutant = "terminal")
               /\ execution' = next
               /\ terminalBroken' = (terminalBroken \/ (execution \in Terminal /\ next # execution))
             /\ UNCHANGED <<present, receipt, receiptBroken, inferred>>
ReviseReceipt == /\ present /\ \E next \in Receipts:
                   /\ (receipt # "verified" \/ next = "verified" \/ Mutant = "receipt")
                   /\ receipt' = next
                   /\ receiptBroken' = (receiptBroken \/ (receipt = "verified" /\ next # "verified"))
                 /\ UNCHANGED <<present, execution, terminalBroken, inferred>>
ReadMissing == /\ ~present /\ inferred' = (Mutant = "missing")
               /\ UNCHANGED <<present, execution, receipt, terminalBroken, receiptBroken>>
Next == CreateRun \/ ReviseRun \/ ReviseReceipt \/ ReadMissing
Spec == Init /\ [][Next]_vars
TypeOK == present \in BOOLEAN /\ execution \in Executions /\ receipt \in Receipts /\ terminalBroken \in BOOLEAN /\ receiptBroken \in BOOLEAN /\ inferred \in BOOLEAN
MissingNeverSuccess == ~inferred
TerminalMonotonic == ~terminalBroken
VerifiedReceiptMonotonic == ~receiptBroken
=============================================================================
