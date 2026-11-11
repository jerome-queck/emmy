----------------------------- MODULE BriefingSlot -----------------------------
EXTENDS Naturals, FiniteSets
CONSTANTS SameBytes, Mutation
Writers == {1, 2}
Candidate(w) == IF SameBytes THEN "a" ELSE IF w = 1 THEN "a" ELSE "b"
VARIABLES pc, prepared, retried, crashed, canonical, complete, firstCanonical,
          marker, firstMarker, evidence, returned, observer, seenSlot, seenMarker
vars == <<pc, prepared, retried, crashed, canonical, complete, firstCanonical,
          marker, firstMarker, evidence, returned, observer, seenSlot, seenMarker>>
Init == /\ pc = [w \in Writers |-> "create"]
        /\ prepared = [w \in Writers |-> FALSE]
        /\ retried = [w \in Writers |-> FALSE]
        /\ crashed = [w \in Writers |-> FALSE]
        /\ canonical = "none" /\ complete = FALSE /\ firstCanonical = "none"
        /\ marker = "none" /\ firstMarker = "none" /\ evidence = {}
        /\ returned = {} /\ observer = "slot" /\ seenSlot = "none" /\ seenMarker = "none"
Create(w) == /\ pc[w] = "create"
             /\ pc' = [pc EXCEPT ![w] = "write"]
             /\ UNCHANGED <<prepared, retried, crashed, canonical, complete, firstCanonical,
                             marker, firstMarker, evidence, returned, observer, seenSlot, seenMarker>>
Write(w) == /\ pc[w] = "write"
            /\ prepared' = [prepared EXCEPT ![w] = TRUE]
            /\ pc' = [pc EXCEPT ![w] = "publish"]
            /\ UNCHANGED <<retried, crashed, canonical, complete, firstCanonical,
                            marker, firstMarker, evidence, returned, observer, seenSlot, seenMarker>>
Publish(w) == /\ (pc[w] = "publish" \/ (Mutation = "early" /\ pc[w] = "write"))
              /\ IF canonical = "none" \/ Mutation = "overwrite"
                 THEN /\ canonical' = Candidate(w)
                      /\ complete' = prepared[w]
                      /\ firstCanonical' = IF firstCanonical = "none" THEN Candidate(w) ELSE firstCanonical
                      /\ returned' = returned \cup {<<Candidate(w), "published">>}
                      /\ pc' = [pc EXCEPT ![w] = "done"]
                 ELSE /\ UNCHANGED <<canonical, complete, firstCanonical, returned>>
                      /\ pc' = [pc EXCEPT ![w] = "read"]
              /\ UNCHANGED <<prepared, retried, crashed, marker, firstMarker, evidence,
                              observer, seenSlot, seenMarker>>
Read(w) == /\ pc[w] = "read"
           /\ IF canonical = Candidate(w)
              THEN /\ returned' = returned \cup {<<Candidate(w), "identical">>}
                   /\ pc' = [pc EXCEPT ![w] = "done"]
              ELSE /\ UNCHANGED returned
                   /\ pc' = [pc EXCEPT ![w] = "marker"]
           /\ UNCHANGED <<prepared, retried, crashed, canonical, complete, firstCanonical,
                           marker, firstMarker, evidence, observer, seenSlot, seenMarker>>
Mark(w) == /\ pc[w] = "marker"
           /\ marker' = IF marker = "none" /\ Mutation # "omit-marker" THEN Candidate(w) ELSE marker
           /\ firstMarker' = IF firstMarker = "none" /\ Mutation # "omit-marker" THEN Candidate(w) ELSE firstMarker
           /\ pc' = [pc EXCEPT ![w] = "evidence"]
           /\ UNCHANGED <<prepared, retried, crashed, canonical, complete, firstCanonical,
                           evidence, returned, observer, seenSlot, seenMarker>>
Retain(w) == /\ pc[w] = "evidence"
             /\ evidence' = evidence \cup {Candidate(w)}
             /\ pc' = [pc EXCEPT ![w] = "reply"]
             /\ UNCHANGED <<prepared, retried, crashed, canonical, complete, firstCanonical,
                             marker, firstMarker, returned, observer, seenSlot, seenMarker>>
Reply(w) == /\ pc[w] = "reply"
            /\ returned' = returned \cup {<<Candidate(w), "conflict">>}
            /\ pc' = [pc EXCEPT ![w] = "done"]
            /\ UNCHANGED <<prepared, retried, crashed, canonical, complete, firstCanonical,
                            marker, firstMarker, evidence, observer, seenSlot, seenMarker>>
Crash(w) == /\ pc[w] \notin {"done", "crashed"} /\ ~crashed[w]
            /\ pc' = [pc EXCEPT ![w] = "crashed"]
            /\ crashed' = [crashed EXCEPT ![w] = TRUE]
            /\ UNCHANGED <<prepared, retried, canonical, complete, firstCanonical,
                            marker, firstMarker, evidence, returned, observer, seenSlot, seenMarker>>
Retry(w) == /\ pc[w] \in {"done", "crashed"} /\ ~retried[w]
            /\ pc' = [pc EXCEPT ![w] = "create"]
            /\ prepared' = [prepared EXCEPT ![w] = FALSE]
            /\ retried' = [retried EXCEPT ![w] = TRUE]
            /\ UNCHANGED <<crashed, canonical, complete, firstCanonical,
                            marker, firstMarker, evidence, returned, observer, seenSlot, seenMarker>>
ObserveSlot == /\ observer = "slot" /\ seenSlot' = canonical /\ observer' = "marker"
               /\ UNCHANGED <<pc, prepared, retried, crashed, canonical, complete, firstCanonical,
                               marker, firstMarker, evidence, returned, seenMarker>>
ObserveMarker == /\ observer = "marker" /\ seenMarker' = marker /\ observer' = "done"
                 /\ UNCHANGED <<pc, prepared, retried, crashed, canonical, complete, firstCanonical,
                                 marker, firstMarker, evidence, returned, seenSlot>>
Next == (\E w \in Writers: Create(w) \/ Write(w) \/ Publish(w) \/ Read(w) \/ Mark(w) \/
                          Retain(w) \/ Reply(w) \/ Crash(w) \/ Retry(w)) \/ ObserveSlot \/ ObserveMarker
Spec == Init /\ [][Next]_vars
PublishedComplete == canonical # "none" => complete
CanonicalImmutable == canonical = firstCanonical
FirstMarkerPersists == marker = firstMarker
RetryConverges == \A r \in returned: r[2] \in {"published", "identical"} => r[1] = canonical
ConflictRetained == \A r \in returned: r[2] = "conflict" => marker # "none" /\ r[1] \in evidence /\ r[1] # canonical
ObservedImmutable == (seenSlot = "none" \/ seenSlot = canonical) /\ (seenMarker = "none" \/ seenMarker = marker)
=============================================================================
