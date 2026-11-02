------------------------ MODULE AutomationReporting ------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Mutant
VARIABLES staleInput, staleObserved, committed, canonical, stage, crashed, returned, injected, reader, captured, complete, accepted, authority
vars == <<staleInput, staleObserved, committed, canonical, stage, crashed, returned, injected, reader, captured, complete, accepted, authority>>
Writers == {1, 2}
Records == {"a", "b", "c", "bad"}
Request(w) == IF w = 1 THEN "b" ELSE "c"
Valid(s) == "bad" \notin s /\ (s \cap {"b", "c"} = {} \/ "a" \in s)
Conflict(s) == {"b", "c"} \subseteq s
Init == /\ staleInput = FALSE /\ staleObserved = FALSE /\ committed = {"a"} /\ canonical = {"a"} /\ stage = [w \in Writers |-> "new"]
        /\ crashed = {} /\ returned = {} /\ injected = FALSE
        /\ reader = "new" /\ captured = {} /\ complete = FALSE
        /\ accepted = FALSE /\ authority = FALSE
Start(w) == /\ stage[w] = "new"
            /\ stage' = [stage EXCEPT ![w] = "partial"]
            /\ canonical' = IF Mutant = "partial" THEN canonical \cup {Request(w)} ELSE canonical
            /\ UNCHANGED <<staleInput, staleObserved, committed, crashed, returned, injected, reader, captured, complete, accepted, authority>>
Write(w) == /\ stage[w] = "partial" /\ stage' = [stage EXCEPT ![w] = "ready"]
            /\ UNCHANGED <<staleInput, staleObserved, committed, canonical, crashed, returned, injected, reader, captured, complete, accepted, authority>>
Link(w) == /\ committed' = committed \cup {Request(w)} /\ stage[w] = "ready" /\ canonical' = canonical \cup {Request(w)}
           /\ stage' = [stage EXCEPT ![w] = "linked"]
           /\ UNCHANGED <<staleInput, staleObserved, crashed, returned, injected, reader, captured, complete, accepted, authority>>
Reply(w) == /\ stage[w] = "linked" /\ stage' = [stage EXCEPT ![w] = "done"]
            /\ returned' = returned \cup {Request(w)}
            /\ UNCHANGED <<staleInput, staleObserved, committed, canonical, crashed, injected, reader, captured, complete, accepted, authority>>
Crash(w) == /\ w \notin crashed /\ stage[w] \in {"partial", "ready", "linked"}
            /\ stage' = [stage EXCEPT ![w] = "stopped"] /\ crashed' = crashed \cup {w}
            /\ UNCHANGED <<staleInput, staleObserved, committed, canonical, returned, injected, reader, captured, complete, accepted, authority>>
Retry(w) == /\ stage[w] = "stopped" /\ stage' = [stage EXCEPT ![w] = "new"]
            /\ UNCHANGED <<staleInput, staleObserved, committed, canonical, crashed, returned, injected, reader, captured, complete, accepted, authority>>
CorruptSync == /\ ~injected /\ injected' = TRUE /\ canonical' = canonical \cup {"bad"}
               /\ UNCHANGED <<staleInput, staleObserved, committed, stage, crashed, returned, reader, captured, complete, accepted, authority>>
Scan == /\ staleInput' \in BOOLEAN /\ reader = "new" /\ reader' = "captured"
        /\ \E s \in SUBSET canonical: captured' = s
        /\ complete' \in BOOLEAN
        /\ UNCHANGED <<staleObserved, committed, canonical, stage, crashed, returned, injected, accepted, authority>>
Classify == /\ staleObserved' = (staleInput /\ Mutant # "stale") /\ reader = "captured" /\ reader' = "done"
            /\ accepted' = IF Mutant = "accept" THEN TRUE ELSE complete /\ Valid(captured) /\ ~Conflict(captured)
            /\ authority' = (Mutant = "authority" /\ "b" \in captured)
            /\ UNCHANGED <<staleInput, committed, canonical, stage, crashed, returned, injected, captured, complete>>
Next == (\E w \in Writers: Start(w) \/ Write(w) \/ Link(w) \/ Reply(w) \/ Crash(w) \/ Retry(w))
        \/ CorruptSync \/ Scan \/ Classify
Spec == Init /\ [][Next]_vars
TypeOK == /\ staleInput \in BOOLEAN /\ staleObserved \in BOOLEAN /\ committed \subseteq Records /\ canonical \subseteq Records /\ stage \in [Writers -> {"new", "partial", "ready", "linked", "done", "stopped"}]
          /\ crashed \subseteq Writers /\ returned \subseteq Records /\ injected \in BOOLEAN
          /\ reader \in {"new", "captured", "done"} /\ captured \subseteq Records
          /\ complete \in BOOLEAN /\ accepted \in BOOLEAN /\ authority \in BOOLEAN
PublishedComplete == canonical \ {"bad"} \subseteq committed
CompletedSurvive == returned \subseteq canonical
AcceptedSafe == accepted => complete /\ Valid(captured) /\ ~Conflict(captured)
NoFalseAuthority == ~authority
StaleVisible == reader = "done" /\ staleInput => staleObserved
=============================================================================
