------------------------ MODULE RecordPublication ------------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS SameHash, DirectCanonical, ReverseImport

Writers == {1, 2}
Hashes == {"a", "b", "c"}
None == "none"
Order(w, reverse) == IF SameHash THEN <<"a">>
           ELSE IF w = 1 THEN IF reverse THEN <<"b", "a">>
                              ELSE <<"a", "b">>
           ELSE <<"c">>
Dependencies(h) == IF h = "b" THEN {"a"} ELSE {}

NoDirectory == 0
EmptyDirectory == 1
PartialRecord == 2
CompleteRecord == 3
PartialEvidence == 4
CompleteFiles == 5
Stages == {NoDirectory, EmptyDirectory, PartialRecord, CompleteRecord, PartialEvidence, CompleteFiles}
Phases == {"create", "record-partial", "record-complete", "evidence-partial",
           "evidence-complete", "rename", "read-record", "read-evidence",
           "cleanup", "reply", "next", "crashed", "done", "refused"}

VARIABLES pc, cursor, attempt, reordered, pending, orphan, canonical, content,
          header, readbacks, completed, observer, listed, unread, active,
          manifest

vars == <<pc, cursor, attempt, reordered, pending, orphan, canonical, content,
          header, readbacks, completed, observer, listed, unread, active,
          manifest>>

Plan(w) == Order(w, ReverseImport \/ reordered[w])
Expected(w) == {Plan(w)[i] : i \in 1..Len(Plan(w))}
Current(w) == Plan(w)[cursor[w]]
Visible == {h \in Hashes : canonical[h] # NoDirectory}

Init ==
  /\ pc = [w \in Writers |-> "create"]
  /\ cursor = [w \in Writers |-> 1]
  /\ attempt = [w \in Writers |-> 0]
  /\ reordered = [w \in Writers |-> FALSE]
  /\ pending = [w \in Writers |-> NoDirectory]
  /\ orphan = [w \in Writers |-> FALSE]
  /\ canonical = [h \in Hashes |-> NoDirectory]
  /\ content = [h \in Hashes |-> None]
  /\ header = [w \in Writers |-> None]
  /\ readbacks = [w \in Writers |-> {}]
  /\ completed = [w \in Writers |-> {}]
  /\ observer = "list"
  /\ listed = {}
  /\ unread = {}
  /\ active = None
  /\ manifest = {}

CreatePending(w) ==
  /\ pc[w] = "create"
  /\ IF DirectCanonical
        THEN /\ canonical[Current(w)] = NoDirectory
             /\ canonical' = [canonical EXCEPT ![Current(w)] = EmptyDirectory]
             /\ content' = [content EXCEPT ![Current(w)] = Current(w)]
        ELSE UNCHANGED <<canonical, content>>
  /\ pending' = [pending EXCEPT ![w] = EmptyDirectory]
  /\ pc' = [pc EXCEPT ![w] = "record-partial"]
  /\ UNCHANGED <<reordered, cursor, attempt, orphan, header, readbacks, completed,
                  observer, listed, unread, active, manifest>>

WriteFile(w, phase, following, stage) ==
  /\ pc[w] = phase
  /\ pending' = [pending EXCEPT ![w] = stage]
  /\ canonical' = IF DirectCanonical
                    THEN [canonical EXCEPT ![Current(w)] = stage]
                    ELSE canonical
  /\ pc' = [pc EXCEPT ![w] = following]
  /\ UNCHANGED <<reordered, cursor, attempt, orphan, content, header, readbacks,
                  completed, observer, listed, unread, active, manifest>>

Rename(w) ==
  /\ pc[w] = "rename"
  /\ pending[w] = CompleteFiles
  /\ IF canonical[Current(w)] = NoDirectory
        THEN /\ canonical' = [canonical EXCEPT ![Current(w)] = pending[w]]
             /\ content' = [content EXCEPT ![Current(w)] = Current(w)]
             /\ pending' = [pending EXCEPT ![w] = NoDirectory]
        ELSE UNCHANGED <<canonical, content, pending>>
  /\ pc' = [pc EXCEPT ![w] = "read-record"]
  /\ UNCHANGED <<reordered, cursor, attempt, orphan, header, readbacks, completed,
                  observer, listed, unread, active, manifest>>

ReadRecord(w) ==
  /\ pc[w] = "read-record"
  /\ header' = [header EXCEPT ![w] = content[Current(w)]]
  /\ pc' = [pc EXCEPT ![w] = IF canonical[Current(w)] >= CompleteRecord
                              /\ content[Current(w)] = Current(w)
                              THEN "read-evidence" ELSE "refused"]
  /\ UNCHANGED <<reordered, cursor, attempt, pending, orphan, canonical, content,
                  readbacks, completed, observer, listed, unread, active,
                  manifest>>

ReadEvidence(w) ==
  /\ pc[w] = "read-evidence"
  /\ canonical[Current(w)] = CompleteFiles
  /\ header[w] = Current(w)
  /\ readbacks' = [readbacks EXCEPT ![w] = @ \cup {Current(w)}]
  /\ pc' = [pc EXCEPT ![w] = "cleanup"]
  /\ UNCHANGED <<reordered, cursor, attempt, pending, orphan, canonical, content,
                  header, completed, observer, listed, unread, active,
                  manifest>>

Cleanup(w) ==
  /\ pc[w] = "cleanup"
  /\ pending' = [pending EXCEPT ![w] = NoDirectory]
  /\ pc' = [pc EXCEPT ![w] = "reply"]
  /\ UNCHANGED <<reordered, cursor, attempt, orphan, canonical, content, header,
                  readbacks, completed, observer, listed, unread, active,
                  manifest>>

Reply(w) ==
  /\ pc[w] = "reply"
  /\ completed' = [completed EXCEPT ![w] = @ \cup {Current(w)}]
  /\ pc' = [pc EXCEPT ![w] = "next"]
  /\ UNCHANGED <<reordered, cursor, attempt, pending, orphan, canonical, content,
                  header, readbacks, observer, listed, unread, active,
                  manifest>>

ImportNext(w) ==
  /\ pc[w] = "next"
  /\ IF cursor[w] < Len(Plan(w))
        THEN /\ cursor' = [cursor EXCEPT ![w] = @ + 1]
             /\ pc' = [pc EXCEPT ![w] = "create"]
        ELSE /\ cursor' = cursor
             /\ pc' = [pc EXCEPT ![w] = "done"]
  /\ header' = [header EXCEPT ![w] = None]
  /\ UNCHANGED <<reordered, attempt, pending, orphan, canonical, content, readbacks,
                  completed, observer, listed, unread, active, manifest>>

Crash(w) ==
  /\ pc[w] \notin {"done", "crashed", "refused"}
  /\ attempt[w] = 0
  /\ orphan' = [orphan EXCEPT ![w] = pending[w] # NoDirectory]
  /\ pending' = [pending EXCEPT ![w] = NoDirectory]
  /\ pc' = [pc EXCEPT ![w] = "crashed"]
  /\ header' = [header EXCEPT ![w] = None]
  /\ UNCHANGED <<reordered, cursor, attempt, canonical, content, readbacks, completed,
                  observer, listed, unread, active, manifest>>

Retry(w) ==
  /\ pc[w] = "crashed"
  /\ attempt' = [attempt EXCEPT ![w] = 1]
  /\ \E reverse \in IF ~SameHash /\ w = 1 /\ "a" \in Visible
                      THEN {FALSE, TRUE} ELSE {FALSE}:
       reordered' = [reordered EXCEPT ![w] = reverse]
  /\ cursor' = [cursor EXCEPT ![w] = 1]
  /\ pc' = [pc EXCEPT ![w] = "create"]
  /\ UNCHANGED <<pending, orphan, canonical, content, header, readbacks,
                  completed, observer, listed, unread, active, manifest>>

ObserveList ==
  /\ observer = "list"
  /\ \E names \in SUBSET Visible:
       /\ listed' = names
       /\ unread' = names
  /\ observer' = "choose"
  /\ UNCHANGED <<reordered, pc, cursor, attempt, pending, orphan, canonical, content,
                  header, readbacks, completed, active, manifest>>

ObserveChoose ==
  /\ observer = "choose"
  /\ IF unread = {}
        THEN /\ observer' = "validate"
             /\ active' = None
        ELSE /\ \E h \in unread: active' = h
             /\ observer' = "record"
  /\ UNCHANGED <<reordered, pc, cursor, attempt, pending, orphan, canonical, content,
                  header, readbacks, completed, listed, unread, manifest>>

ObserveRecord ==
  /\ observer = "record"
  /\ observer' = IF canonical[active] >= CompleteRecord /\ content[active] = active
                    THEN "evidence" ELSE "rejected"
  /\ UNCHANGED <<reordered, pc, cursor, attempt, pending, orphan, canonical, content,
                  header, readbacks, completed, listed, unread, active,
                  manifest>>

ObserveEvidence ==
  /\ observer = "evidence"
  /\ canonical[active] = CompleteFiles
  /\ content[active] = active
  /\ manifest' = manifest \cup {active}
  /\ unread' = unread \ {active}
  /\ observer' = "choose"
  /\ UNCHANGED <<reordered, pc, cursor, attempt, pending, orphan, canonical, content,
                  header, readbacks, completed, listed, active>>

ObserveValidate ==
  /\ observer = "validate"
  /\ observer' = IF \A h \in manifest: Dependencies(h) \subseteq manifest
                    THEN "accepted" ELSE "rejected"
  /\ UNCHANGED <<reordered, pc, cursor, attempt, pending, orphan, canonical, content,
                  header, readbacks, completed, listed, unread, active,
                  manifest>>

Next ==
  \/ \E w \in Writers:
       \/ CreatePending(w)
       \/ WriteFile(w, "record-partial", "record-complete", PartialRecord)
       \/ WriteFile(w, "record-complete", "evidence-partial", CompleteRecord)
       \/ WriteFile(w, "evidence-partial", "evidence-complete", PartialEvidence)
       \/ WriteFile(w, "evidence-complete", "rename", CompleteFiles)
       \/ Rename(w)
       \/ ReadRecord(w)
       \/ ReadEvidence(w)
       \/ Cleanup(w)
       \/ Reply(w)
       \/ ImportNext(w)
       \/ Crash(w)
       \/ Retry(w)
  \/ ObserveList
  \/ ObserveChoose
  \/ ObserveRecord
  \/ ObserveEvidence
  \/ ObserveValidate

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ pc \in [Writers -> Phases]
  /\ cursor \in [Writers -> 1..2]
  /\ attempt \in [Writers -> 0..1]
  /\ reordered \in [Writers -> BOOLEAN]
  /\ pending \in [Writers -> Stages]
  /\ orphan \in [Writers -> BOOLEAN]
  /\ canonical \in [Hashes -> Stages]
  /\ content \in [Hashes -> Hashes \cup {None}]
  /\ header \in [Writers -> Hashes \cup {None}]
  /\ readbacks \in [Writers -> SUBSET Hashes]
  /\ completed \in [Writers -> SUBSET Hashes]
  /\ observer \in {"list", "choose", "record", "evidence", "validate",
                     "accepted", "rejected"}
  /\ listed \subseteq Hashes
  /\ unread \subseteq listed
  /\ active \in Hashes \cup {None}
  /\ manifest \subseteq listed

PublishedComplete == \A h \in Visible:
                        canonical[h] = CompleteFiles /\ content[h] = h
ImportPrefixSafe == ~SameHash => ("b" \in Visible => "a" \in Visible)
ReadbackExact == \A w \in Writers:
                   /\ readbacks[w] \subseteq Expected(w)
                   /\ \A h \in readbacks[w]:
                        canonical[h] = CompleteFiles /\ content[h] = h
CompletedSurvive == \A w \in Writers: completed[w] \subseteq Visible
RetryConvergesOnReturn == \A w \in Writers:
                           pc[w] = "done" => completed[w] = Expected(w)
AcceptedManifestComplete == observer = "accepted" =>
  /\ \A h \in manifest: Dependencies(h) \subseteq manifest
  /\ \A h \in manifest: canonical[h] = CompleteFiles /\ content[h] = h

=============================================================================
