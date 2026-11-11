---------------------------- MODULE UnboundOutcome ----------------------------
EXTENDS Naturals, TLC
CONSTANT Mutant
VARIABLES captured, read, originalClock, priorReport, mode, exactBasis, terminal,
          metadataStable, originalBasisClock, originalBeforeBasis, sameReport, sameSummary,
          representation, accepted, sourceFresh
vars == <<captured, read, originalClock, priorReport, mode, exactBasis, terminal,
          metadataStable, originalBasisClock, originalBeforeBasis, sameReport, sameSummary,
          representation, accepted, sourceFresh>>
Init == /\ captured = FALSE /\ read = FALSE /\ originalClock = "unknown"
        /\ priorReport = "null" /\ mode = "producer" /\ exactBasis = TRUE
        /\ terminal = TRUE /\ metadataStable = TRUE /\ originalBasisClock = TRUE
        /\ originalBeforeBasis = TRUE /\ sameReport = TRUE /\ sameSummary = TRUE /\ representation = "v2-unbound"
        /\ accepted = FALSE /\ sourceFresh = FALSE
Capture == /\ ~captured /\ captured' = TRUE
           /\ originalClock' \in {"old", "fresh", "unknown"}
           /\ priorReport' \in {"null", "retrospective", "producer"}
           /\ mode' \in {"producer", "retrospective"}
           /\ exactBasis' \in BOOLEAN /\ terminal' \in BOOLEAN
           /\ metadataStable' \in BOOLEAN /\ originalBasisClock' \in BOOLEAN
           /\ originalBeforeBasis' \in BOOLEAN /\ sameReport' \in BOOLEAN /\ sameSummary' \in BOOLEAN
           /\ representation' \in {"v2-unbound", "manual", "v1-downgrade"}
           /\ (sameReport' => sameSummary')
           /\ (priorReport' = "retrospective" /\ sameReport' => mode' = "retrospective" /\ representation' = "v2-unbound")
           /\ UNCHANGED <<read, accepted, sourceFresh>>
ReadOutcome == /\ captured /\ ~read /\ read' = TRUE
  /\ LET attaching == mode = "retrospective"
          immutable == priorReport = "retrospective"
          basisOK == priorReport = "null" /\ exactBasis /\ terminal /\ originalBasisClock /\ originalBeforeBasis
          carryOK == sameReport /\ mode = "retrospective" /\ representation = "v2-unbound"
      IN /\ accepted' = (IF immutable THEN (metadataStable \/ Mutant = "metadata") /\ (carryOK \/ Mutant = "immutable" \/ (Mutant = "representation" /\ sameSummary))
                           ELSE IF attaching THEN (metadataStable \/ Mutant = "metadata") /\ (basisOK \/ Mutant = "basis")
                           ELSE TRUE)
         /\ sourceFresh' = (originalClock = "fresh" \/ (Mutant = "clocks" /\ originalClock = "old"))
  /\ UNCHANGED <<captured, originalClock, priorReport, mode, exactBasis, terminal,
                 metadataStable, originalBasisClock, originalBeforeBasis, sameReport, sameSummary, representation>>
Next == Capture \/ ReadOutcome
Spec == Init /\ [][Next]_vars
TypeOK == /\ captured \in BOOLEAN /\ read \in BOOLEAN /\ accepted \in BOOLEAN /\ sourceFresh \in BOOLEAN
          /\ originalClock \in {"old", "fresh", "unknown"}
          /\ priorReport \in {"null", "retrospective", "producer"}
          /\ mode \in {"producer", "retrospective"}
          /\ exactBasis \in BOOLEAN /\ terminal \in BOOLEAN /\ metadataStable \in BOOLEAN
          /\ originalBasisClock \in BOOLEAN /\ originalBeforeBasis \in BOOLEAN /\ sameReport \in BOOLEAN /\ sameSummary \in BOOLEAN
          /\ representation \in {"v2-unbound", "manual", "v1-downgrade"}
OriginalClockSafe == read /\ sourceFresh => originalClock = "fresh"
RetrospectiveBasisSafe == read /\ accepted /\ priorReport # "retrospective" /\ mode = "retrospective" => priorReport = "null" /\ exactBasis /\ terminal /\ originalBasisClock /\ originalBeforeBasis
RetrospectiveMetadataSafe == read /\ accepted /\ (priorReport = "retrospective" \/ mode = "retrospective") => metadataStable
AttachedReportImmutable == read /\ accepted /\ priorReport = "retrospective" => sameReport /\ mode = "retrospective"
UnboundRepresentationSafe == read /\ accepted /\ priorReport = "retrospective" => representation = "v2-unbound"
=============================================================================
