alter table filemind.document_relations drop constraint document_relations_kind_check;
alter table filemind.document_relations add constraint document_relations_kind_check check(kind in ('rule-based','ai-inferred','shared_concept','semantic'));
