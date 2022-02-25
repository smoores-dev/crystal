```mermaid
graph TD
    classDef path fill:#eee,stroke:#000,color:#000
    classDef plan fill:#fff,stroke-width:3px,color:#000
    classDef itemplan fill:#fff,stroke-width:6px,color:#000
    classDef sideeffectplan fill:#f00,stroke-width:6px,color:#000
    classDef bucket fill:#f6f6f6,color:#000,stroke-width:6px

    %% subgraph fields
    P1{{"~"}}:::path
    P2{{">allMessagesConnection"}}:::path
    P3[/">al…ion>edges"\]:::path
    P4>">al…ion>edges[]"]:::path
    P3 -.- P4
    P5([">al…ion>edges[]>cursor"]):::path
    %% P4 -.-> P5
    P6{{">al…ion>edges[]>node"}}:::path
    P7([">al…ion>edges[]>node>body"]):::path
    %% P6 -.-> P7
    P8{{">al…ion>edges[]>node>author"}}:::path
    P9([">al…ion>edges[]>node>author>username"]):::path
    %% P8 -.-> P9
    P10([">al…ion>edges[]>node>author>gravatarUrl"]):::path
    %% P8 -.-> P10
    %% P6 -.-> P8
    %% P4 -.-> P6
    %% P2 -.-> P3
    P11{{">al…ion>pageInfo"}}:::path
    P12([">al…ion>pa…nfo>hasNextPage"]):::path
    %% P11 -.-> P12
    P13([">al…ion>pa…nfo>hasPreviousPage"]):::path
    %% P11 -.-> P13
    P14([">al…ion>pa…nfo>startCursor"]):::path
    %% P11 -.-> P14
    P15([">al…ion>pa…nfo>endCursor"]):::path
    %% P11 -.-> P15
    %% P2 -.-> P11
    P16([">al…ion>totalCount"]):::path
    %% P2 -.-> P16
    %% P1 -.-> P2
    %% end

    %% define plans
    __Value_3["__Value[_3∈0]<br /><context>"]:::plan
    __Value_5["__Value[_5∈0]<br /><rootValue>"]:::plan
    __TrackedObject_6["__TrackedObject[_6∈0]"]:::plan
    InputStaticLeaf_14["InputStaticLeaf[_14∈0]"]:::plan
    InputStaticLeaf_15["InputStaticLeaf[_15∈0]"]:::plan
    InputStaticLeaf_16["InputStaticLeaf[_16∈0]"]:::plan
    InputStaticLeaf_17["InputStaticLeaf[_17∈0]"]:::plan
    Connection_24["Connection[_24∈0]<br /><_20>"]:::plan
    PgSelect_25[["PgSelect[_25∈0]<br /><messages>"]]:::plan
    __Item_26>"__Item[_26∈1]<br /><_25>"]:::itemplan
    PgSelectSingle_27["PgSelectSingle[_27∈1]<br /><messages>"]:::plan
    PgCursor_28["PgCursor[_28∈1]"]:::plan
    PgClassExpression_29["PgClassExpression[_29∈1]<br /><__messages__.#quot;id#quot;>"]:::plan
    List_30["List[_30∈1]<br /><_29>"]:::plan
    PgClassExpression_31["PgClassExpression[_31∈1]<br /><__messages__.#quot;body#quot;>"]:::plan
    Access_34["Access[_34∈0]<br /><_3.pgSettings>"]:::plan
    Access_35["Access[_35∈0]<br /><_3.withPgClient>"]:::plan
    Object_36["Object[_36∈0]<br /><{pgSettings,withPgClient}>"]:::plan
    First_37["First[_37∈1]"]:::plan
    PgSelectSingle_38["PgSelectSingle[_38∈1]<br /><users>"]:::plan
    PgClassExpression_39["PgClassExpression[_39∈1]<br /><__users__.#quot;username#quot;>"]:::plan
    PgClassExpression_40["PgClassExpression[_40∈1]<br /><__users__....vatar_url#quot;>"]:::plan
    PgPageInfo_41["PgPageInfo[_41∈0]"]:::plan
    Lambda_43["Lambda[_43∈0]<br /><listHasMore>"]:::plan
    Constant_44["Constant[_44∈0]"]:::plan
    First_46["First[_46∈0]"]:::plan
    PgSelectSingle_47["PgSelectSingle[_47∈0]<br /><messages>"]:::plan
    PgCursor_48["PgCursor[_48∈0]"]:::plan
    PgClassExpression_49["PgClassExpression[_49∈0]<br /><__messages__.#quot;id#quot;>"]:::plan
    List_50["List[_50∈0]<br /><_49>"]:::plan
    Last_52["Last[_52∈0]"]:::plan
    PgSelectSingle_53["PgSelectSingle[_53∈0]<br /><messages>"]:::plan
    PgCursor_54["PgCursor[_54∈0]"]:::plan
    PgClassExpression_55["PgClassExpression[_55∈0]<br /><__messages__.#quot;id#quot;>"]:::plan
    List_56["List[_56∈0]<br /><_55>"]:::plan
    PgSelect_57[["PgSelect[_57∈0]<br /><messages>"]]:::plan
    First_58["First[_58∈0]"]:::plan
    PgSelectSingle_59["PgSelectSingle[_59∈0]<br /><messages>"]:::plan
    PgClassExpression_60["PgClassExpression[_60∈0]<br /><count(*)>"]:::plan
    Map_61["Map[_61∈1]<br /><_27:{#quot;0#quot;:2,#quot;1#quot;:3}>"]:::plan
    List_62["List[_62∈1]<br /><_61>"]:::plan

    %% plan dependencies
    __Value_5 --> __TrackedObject_6
    InputStaticLeaf_14 --> Connection_24
    InputStaticLeaf_15 --> Connection_24
    InputStaticLeaf_16 --> Connection_24
    InputStaticLeaf_17 --> Connection_24
    Object_36 --> PgSelect_25
    PgSelect_25 ==> __Item_26
    __Item_26 --> PgSelectSingle_27
    List_30 --> PgCursor_28
    PgSelectSingle_27 --> PgClassExpression_29
    PgClassExpression_29 --> List_30
    PgSelectSingle_27 --> PgClassExpression_31
    __Value_3 --> Access_34
    __Value_3 --> Access_35
    Access_34 --> Object_36
    Access_35 --> Object_36
    List_62 --> First_37
    First_37 --> PgSelectSingle_38
    PgSelectSingle_38 --> PgClassExpression_39
    PgSelectSingle_38 --> PgClassExpression_40
    PgSelect_25 --> Lambda_43
    PgSelect_25 --> First_46
    First_46 --> PgSelectSingle_47
    List_50 --> PgCursor_48
    PgSelectSingle_47 --> PgClassExpression_49
    PgClassExpression_49 --> List_50
    PgSelect_25 --> Last_52
    Last_52 --> PgSelectSingle_53
    List_56 --> PgCursor_54
    PgSelectSingle_53 --> PgClassExpression_55
    PgClassExpression_55 --> List_56
    Object_36 --> PgSelect_57
    PgSelect_57 --> First_58
    First_58 --> PgSelectSingle_59
    PgSelectSingle_59 --> PgClassExpression_60
    PgSelectSingle_27 --> Map_61
    Map_61 --> List_62

    %% plan-to-path relationships
    __TrackedObject_6 -.-> P1
    Connection_24 -.-> P2
    PgSelect_25 -.-> P3
    PgSelectSingle_27 -.-> P4
    PgCursor_28 -.-> P5
    PgSelectSingle_27 -.-> P6
    PgClassExpression_31 -.-> P7
    PgSelectSingle_38 -.-> P8
    PgClassExpression_39 -.-> P9
    PgClassExpression_40 -.-> P10
    PgPageInfo_41 -.-> P11
    Lambda_43 -.-> P12
    Constant_44 -.-> P13
    PgCursor_48 -.-> P14
    PgCursor_54 -.-> P15
    PgClassExpression_60 -.-> P16

    %% allocate buckets
    classDef bucket0 stroke:#696969
    class __Value_3,__Value_5,__TrackedObject_6,InputStaticLeaf_14,InputStaticLeaf_15,InputStaticLeaf_16,InputStaticLeaf_17,Connection_24,PgSelect_25,Access_34,Access_35,Object_36,PgPageInfo_41,Lambda_43,Constant_44,First_46,PgSelectSingle_47,PgCursor_48,PgClassExpression_49,List_50,Last_52,PgSelectSingle_53,PgCursor_54,PgClassExpression_55,List_56,PgSelect_57,First_58,PgSelectSingle_59,PgClassExpression_60 bucket0
    classDef bucket1 stroke:#a52a2a
    class __Item_26,PgSelectSingle_27,PgCursor_28,PgClassExpression_29,List_30,PgClassExpression_31,First_37,PgSelectSingle_38,PgClassExpression_39,PgClassExpression_40,Map_61,List_62 bucket1

    subgraph Buckets
    Bucket0("Bucket 0 (root)<br />~"):::bucket
    style Bucket0 stroke:#696969
    Bucket1("Bucket 1 (__Item[_26])<br />>allMe…ction>edges[]"):::bucket
    style Bucket1 stroke:#a52a2a
    Bucket0 --> Bucket1
    end
```