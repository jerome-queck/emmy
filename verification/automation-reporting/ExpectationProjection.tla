------------------------ MODULE ExpectationProjection ------------------------
EXTENDS Naturals, TLC
CONSTANT Mutant
VARIABLES captured, read, target, owner, authority, slotValid, dependency, complete, fresh, changed,
          effective, runKind, runUsable, afterGrace, state, execution, matched
vars == <<captured, read, target, owner, authority, slotValid, dependency, complete, fresh, changed,
          effective, runKind, runUsable, afterGrace, state, execution, matched>>
Init == /\ captured = FALSE /\ read = FALSE
        /\ authority = TRUE /\ slotValid = TRUE
        /\ target = TRUE /\ owner = TRUE /\ dependency = TRUE /\ complete = TRUE
        /\ fresh = TRUE /\ changed = FALSE /\ effective = FALSE
        /\ runKind = "absent" /\ runUsable = TRUE /\ afterGrace = FALSE
        /\ state = "unread" /\ execution = "not-inferred" /\ matched = FALSE
Capture == /\ ~captured /\ captured' = TRUE
           /\ authority' \in BOOLEAN /\ slotValid' \in BOOLEAN
           /\ target' \in BOOLEAN /\ owner' \in BOOLEAN /\ dependency' \in BOOLEAN
           /\ complete' \in BOOLEAN /\ fresh' \in BOOLEAN /\ changed' \in BOOLEAN
           /\ effective' \in BOOLEAN /\ runUsable' \in BOOLEAN /\ afterGrace' \in BOOLEAN
           /\ runKind' \in {"absent", "exact-bound", "other-slot", "manual", "scheduled-unbound"}
           /\ UNCHANGED <<read, state, execution, matched>>
ReadProjection == /\ captured /\ ~read /\ read' = TRUE
  /\ LET valid == (authority \/ Mutant = "authority") /\ (slotValid \/ Mutant = "slot") /\ (target \/ Mutant = "target") /\ (owner \/ Mutant = "owner") /\ (dependency \/ Mutant = "dependency")
          usable == complete \/ Mutant = "complete"
          current == ~changed \/ Mutant = "withdrawal"
          sourceFresh == fresh \/ Mutant = "fresh"
          candidate == runKind = "exact-bound" \/ (runKind = "other-slot" /\ Mutant = "exact") \/ (runKind = "manual" /\ Mutant = "manual") \/ (runKind = "scheduled-unbound" /\ Mutant = "unbound")
      IN /\ matched' = (candidate /\ usable /\ runUsable)
         /\ state' = (IF ~valid \/ ~usable THEN "unknown"
                       ELSE IF changed /\ effective /\ Mutant # "withdrawal" THEN "withdrawn"
                       ELSE IF ~current \/ ~sourceFresh \/ (candidate /\ ~runUsable) THEN "unknown"
                       ELSE IF candidate THEN "observed"
                       ELSE IF afterGrace THEN "observation-gap" ELSE "expected")
  /\ execution' = (IF Mutant = "infer-success" THEN "completed" ELSE IF Mutant = "infer-failure" /\ afterGrace THEN "failed" ELSE "not-inferred")
  /\ UNCHANGED <<captured, target, owner, authority, slotValid, dependency, complete, fresh, changed, effective, runKind, runUsable, afterGrace>>
Next == Capture \/ ReadProjection
Spec == Init /\ [][Next]_vars
TypeOK == /\ captured \in BOOLEAN /\ read \in BOOLEAN /\ target \in BOOLEAN /\ owner \in BOOLEAN
          /\ authority \in BOOLEAN /\ slotValid \in BOOLEAN
          /\ dependency \in BOOLEAN /\ complete \in BOOLEAN /\ fresh \in BOOLEAN
          /\ changed \in BOOLEAN /\ effective \in BOOLEAN /\ runUsable \in BOOLEAN /\ afterGrace \in BOOLEAN
          /\ runKind \in {"absent", "exact-bound", "other-slot", "manual", "scheduled-unbound"}
          /\ state \in {"unread", "unknown", "withdrawn", "observed", "expected", "observation-gap"}
          /\ execution \in {"not-inferred", "completed", "failed"} /\ matched \in BOOLEAN
AuthoritySafe == read /\ state # "unknown" => authority
ConfiguredSlotSafe == read /\ state # "unknown" => slotValid
TargetSafe == read /\ state # "unknown" => target
OwnerSafe == read /\ state # "unknown" => owner
DependencySafe == read /\ state # "unknown" => dependency
CompleteSafe == read /\ state # "unknown" => complete
WithdrawalSafe == read /\ authority /\ slotValid /\ target /\ owner /\ dependency /\ complete /\ changed /\ effective => state = "withdrawn"
FreshSafe == read /\ state \in {"expected", "observed", "observation-gap"} => fresh
ExactSlotSafe == read /\ matched => runKind # "other-slot"
ManualExcluded == read /\ matched => runKind # "manual"
UnboundExcluded == read /\ matched => runKind # "scheduled-unbound"
NeverInferSuccess == execution # "completed"
GraceNeverFailure == execution # "failed"
=============================================================================
